import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "firebase-functions";
import { writeAuditLog } from "../utils/audit";
import { singleLineHeader } from "../utils/headers";
import type { AuditContext } from "../utils/auditTypes";
import type { AuditAction } from "../utils/auditActions";

/**
 * Trunca la dirección a su prefijo de red.
 *
 * Es todo lo que se guarda en Firestore. Con el prefijo se puede responder a
 * "qué más hizo esta red", que es la pregunta útil al investigar un incidente,
 * sin conservar un dato que señale a una persona concreta — y `audit_log` lo
 * lee cualquiera con `audit:read`. La dirección completa existe solo en Cloud
 * Logging, que tiene su propio control de acceso.
 *
 * /24 en IPv4 y /48 en IPv6: en IPv6 el /64 es una sola máquina y el /48 es la
 * asignación típica de un sitio, así que /48 es el equivalente honesto al /24.
 */
export function truncateIp(ip: string | undefined): string | null {
  if (!ip) return null;

  // Detrás de un proxy, una IPv4 puede llegar mapeada a IPv6.
  const unmapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (unmapped.includes(".") && !unmapped.includes(":")) {
    const octets = unmapped.split(".");
    if (octets.length !== 4) return null;
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }

  if (unmapped.includes(":")) {
    // `::` comprime ceros; expandirla entera no aporta nada aquí, porque los
    // tres primeros grupos son justo lo que se conserva.
    const groups = unmapped.split(":");
    const prefix = groups.slice(0, 3).map((g) => g || "0");
    return `${prefix.join(":")}::/48`;
  }

  return null;
}

/** Métodos que cambian estado. Los demás no generan fila de respaldo. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let loggedProxyChain = false;

export function __resetProxyChainLog(): void {
  loggedProxyChain = false;
}

function logProxyChainOnce(req: Request): void {
  if (loggedProxyChain) return;
  loggedProxyChain = true;

  const raw = req.headers?.["x-forwarded-for"];
  const chain = Array.isArray(raw) ? raw.join(", ") : (raw ?? "");
  const entries = chain
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  logger.info("proxy.chain", {
    xForwardedFor: chain,
    entryCount: entries.length,
    firstEntry: entries[0] ?? null,
    lastEntry: entries[entries.length - 1] ?? null,
    resolvedIp: req.ip ?? null,
    matchesFirstEntry: entries.length > 0 && entries[0] === req.ip,
  });
}

/**
 * Patrón de la ruta, no la ruta concreta.
 *
 * `req.route` solo está poblado una vez express ha resuelto el handler, así
 * que esto se llama desde el hook `finish` y no a la entrada. Cuando no hay
 * ruta resuelta (un 404, o un rechazo en un middleware anterior) se cae a
 * `req.path`, que en ese caso es lo único que hay.
 */
function routePattern(req: Request): string {
  const route = (req as { route?: { path?: string } }).route;
  if (route?.path) {
    // `req.baseUrl` es "" con este montaje, pero concatenarlo mantiene el
    // patrón correcto si algún día las rutas cuelgan de un Router.
    return `${req.baseUrl ?? ""}${route.path}`;
  }
  return req.path;
}

/**
 * Ventana de agrupación de las lecturas repetidas. Una hora: lo bastante para
 * que abrir el panel treinta veces en una mañana deje una fila, y lo bastante
 * corto para que "entró por la tarde" y "entró por la noche" se distingan.
 */
const READ_DEDUPE_MS = 60 * 60 * 1000;

/** Última vez que se registró cada (uid, acción). */
const lastRead = new Map<string, number>();

/** Solo para los tests: reinicia el estado en memoria. */
export function __resetReadDedupeState(): void {
  lastRead.clear();
}

export interface AuditedReadOptions {
  /**
   * Agrupa a una fila por hora y por persona. Para las lecturas que el panel
   * repite solo por estar abierto.
   */
  dedupe?: boolean;
  /** Parámetro de ruta que identifica lo leído (p. ej. `"id"`). */
  targetIdParam?: string;
}

/**
 * Registra una lectura sensible.
 *
 * Las lecturas no se auditan en general, y eso es deliberado: una fila por GET
 * daría una por vista de página, y un registro donde el 99% de las filas son
 * "alguien abrió una pantalla" no sirve para encontrar el 1% que importa. Se
 * audita la lista corta de lecturas que exponen datos personales o el propio
 * registro — quién leyó el log de auditoría es exactamente el tipo de cosa que
 * un log de auditoría debería contar.
 *
 * Se engancha en `finish` y solo cuando la respuesta fue 2xx: un 403 no leyó
 * nada, y ya queda registrado como evento de seguridad por su cuenta.
 */
export function auditedRead(
  action: AuditAction,
  targetType: string,
  options: AuditedReadOptions = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const uid = (req as { user?: { uid?: string } }).user?.uid ?? "unknown";
      const targetId = options.targetIdParam
        ? (req.params[options.targetIdParam] as string | undefined)
        : undefined;

      if (options.dedupe) {
        const key = `${uid}:${action}:${targetId ?? "-"}`;
        const now = Date.now();
        const previous = lastRead.get(key);
        if (previous !== undefined && now - previous < READ_DEDUPE_MS) return;
        lastRead.set(key, now);
      }

      void writeAuditLog(
        {
          action,
          performedBy: uid,
          ...(targetId ? { targetId } : {}),
          targetType,
          details: options.dedupe ? { deduped: true } : {},
          category: "read",
        },
        req
      ).catch(() => {
        // La petición ya terminó; no hay nada que devolver.
      });
    });

    next();
  };
}

/**
 * Captura el contexto de la petición y deja una red de seguridad.
 *
 * Va registrado ANTES del limitador de perímetro, para que un 429 también
 * lleve su id de correlación: si alguien satura la API, lo que se quiere poder
 * hacer es cruzar esas respuestas con lo que sí llegó a pasar.
 */
export function auditContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    const context: AuditContext = {
      requestId: randomUUID(),
      method: req.method,
      // Se rellena en el hook `finish`, cuando express ya resolvió la ruta.
      route: req.path,
      ipPrefix: truncateIp(req.ip),
      userAgent: singleLineHeader(req.get("user-agent")) || null,
    };
    req.auditContext = context;
    logProxyChainOnce(req);

    // Útil para que quien reporte un fallo pueda pegar el id, y para cruzar la
    // respuesta con su línea de Cloud Logging.
    res.setHeader("X-Request-Id", context.requestId);

    res.on("finish", () => {
      context.route = routePattern(req);

      // Un handler que auditó lo suyo ya dijo qué pasó, con su targetId y sus
      // detalles. No hay nada que añadir.
      if (req.auditClaimed) return;

      const mutating = MUTATING.has(req.method);
      if (!mutating) return;

      // Las lecturas sensibles se auditan de forma explícita y selectiva; un
      // GET normal no genera fila. Auditar todos los GET daría una fila por
      // vista de página y ahogaría el registro en ruido.
      const status = res.statusCode;
      const outcome =
        status >= 500 ? "failure" : status >= 400 ? "denied" : "success";

      // La línea de Cloud Logging se emite de forma SÍNCRONA. `finish` corre
      // después de volcar la respuesta, así que el framework no espera nada
      // async de aquí y la instancia puede congelarse antes de que termine una
      // escritura a Firestore. El log siempre sale; la fila es best-effort.
      const uid = (req as { user?: { uid?: string } }).user?.uid ?? "unknown";
      // Anotado a propósito: TS ensancha a `string` un template con
      // interpolaciones no literales, y `AuditAction` admite `http.${string}`
      // precisamente para estas filas. La anotación es lo que comprueba que
      // sigan empezando por `http.` y no se cuelen como una acción de dominio.
      const action: AuditAction = `http.${req.method.toLowerCase()}.${context.route}`;

      logger.warn("audit.synthesized", {
        action,
        outcome,
        status,
        performedBy: uid,
        requestId: context.requestId,
        ip: req.ip ?? null,
      });

      // Solo las mutaciones que SALIERON BIEN dejan fila. Un 4xx sin reclamar
      // es casi siempre validación rechazando un cuerpo malformado, y eso ya
      // está en Cloud Logging: escribirlo en Firestore convertiría a cualquiera
      // capaz de mandar basura en dueño del volumen de la colección.
      if (outcome !== "success") return;

      void writeAuditLog(
        {
          action,
          performedBy: uid,
          targetType: "http_request",
          details: { status },
          outcome,
          // `warning`, no `info`: esta fila significa que hay código mutando
          // cosas sin decir qué. Se resalta en el visor para que alguien lo
          // arregle, no para que se normalice.
          severity: "warning",
          category: "operations",
          synthesized: true,
        },
        req
      ).catch(() => {
        // `writeAuditLog` ya registró el fallo, y aquí no hay respuesta que
        // devolver: la petición terminó hace rato.
      });
    });

    next();
  };
}
