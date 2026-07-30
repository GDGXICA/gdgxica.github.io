import type { Request } from "express";
import { logger } from "firebase-functions";
import { writeAuditLog } from "./audit";
import type { AuditSeverity } from "./auditTypes";

/**
 * Eventos de seguridad: denegaciones, canjes fallidos, cuentas suspendidas
 * intentando entrar.
 *
 * El diseño en una frase: **Cloud Logging es el registro completo; Firestore es
 * el subconjunto revisable.** Todo evento emite siempre su línea de log —sin
 * límite, sin coste por escritura— y solo una parte acotada llega a la
 * colección que el panel enseña.
 *
 * Hace falta esa asimetría porque los eventos NO cuestan lo mismo de provocar.
 * Un token inválido lo genera cualquiera sin cuenta y sin coste; una denegación
 * de permiso exige una cuenta registrada. Escribir en Firestore los del primer
 * grupo le regalaría a un atacante no autenticado un amplificador de una
 * petición a una escritura, y el registro quedaría ahogado en ruido justo
 * cuando hiciera falta leerlo.
 */

/**
 * - `log-only`: nunca toca Firestore. Provocarlo es gratis y no requiere
 *   cuenta.
 * - `always`: escribe siempre. Requiere una identidad autenticada y ya va
 *   detrás de un limitador, así que está acotado por construcción.
 * - `rollup`: la primera aparición escribe, las siguientes de la misma clave
 *   dentro de la ventana solo cuentan.
 */
export type SecurityTier = "log-only" | "always" | "rollup";

export interface SecurityEventSpec {
  tier: SecurityTier;
  severity: AuditSeverity;
}

export const SECURITY_EVENTS = {
  /**
   * Token ausente, caducado o inválido.
   *
   * `log-only` y no es una omisión: los ID tokens de Firebase caducan cada
   * hora, así que una pestaña del panel abierta toda la noche produce una
   * ráfaga de 401 al despertar. En Firestore eso sería ruido indistinguible de
   * un ataque, y además lo puede provocar cualquiera sin cuenta. Antes no se
   * registraba en ningún sitio; ahora al menos queda la línea de log.
   */
  "security.auth.invalid_token": { tier: "log-only", severity: "notice" },

  /** App Check ausente o inválido. Endpoints públicos: provocarlo es gratis. */
  "security.appcheck.missing": { tier: "log-only", severity: "notice" },

  /**
   * Permiso denegado a una cuenta registrada. Exige tener cuenta, así que está
   * acotado y es la señal principal de alguien tanteando qué puede tocar.
   */
  "security.permission.denied": { tier: "always", severity: "warning" },

  /**
   * Una cuenta suspendida con un token todavía válido intentando operar.
   *
   * `critical`: es la señal más limpia que hay de una cuenta comprometida o de
   * alguien que ya no debería estar y sigue intentándolo. Provocarlo exige
   * poseer una cuenta suspendida, así que no hay volumen que temer.
   */
  "security.account.suspended_access": { tier: "always", severity: "critical" },

  /**
   * Canje de invitación fallido. El cable trampa contra un enlace robado o
   * reenviado.
   *
   * Antes no dejaba rastro en ningún sitio: adivinar tokens era completamente
   * invisible. Exige correo verificado y va detrás de `accessLimiter`
   * (5/hora/IP), así que quien lo intente consigue cinco filas por hora — está
   * acotado por diseño y no necesita rollup.
   */
  "security.invitation.redeem_failed": { tier: "always", severity: "warning" },

  /** Token válido pero sin doc de usuario. Un token anónimo sale gratis. */
  "security.user.unregistered": { tier: "rollup", severity: "notice" },

  /** Limitador de tasa agotado. Provocarlo es gratis por definición. */
  "security.ratelimit.exceeded": { tier: "rollup", severity: "warning" },
} as const satisfies Record<string, SecurityEventSpec>;

export type SecurityEvent = keyof typeof SECURITY_EVENTS;

const WINDOW_MS = 60_000;

/**
 * Techo de escrituras de seguridad por instancia y minuto.
 *
 * Con `maxInstances: 10` el techo real son 300/min. El contador es por
 * instancia, igual que los seis limitadores de tasa que ya existen: un
 * contador compartido en Firestore costaría una lectura y una escritura por
 * denegación, que es precisamente la amplificación que esto evita.
 */
const BUDGET_PER_WINDOW = 30;

interface Bucket {
  count: number;
  firstAt: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

let spent = 0;
let budgetWindowStart = 0;
let suppressed = 0;

/** Solo para los tests: reinicia el estado en memoria. */
export function __resetSecurityAuditState(): void {
  buckets.clear();
  spent = 0;
  budgetWindowStart = 0;
  suppressed = 0;
}

/**
 * `true` si queda presupuesto. Al agotarse, escribe UNA fila avisando de que
 * se está suprimiendo y deja de escribir hasta que rueda la ventana: sin ese
 * aviso, un registro truncado se leería como "no pasó nada más".
 */
function withinBudget(nowMs: number): boolean {
  if (nowMs - budgetWindowStart >= WINDOW_MS) {
    budgetWindowStart = nowMs;
    spent = 0;
    suppressed = 0;
  }

  if (spent < BUDGET_PER_WINDOW) {
    spent += 1;
    return true;
  }

  suppressed += 1;
  if (suppressed === 1) {
    void writeAuditLog({
      action: "security.audit.throttled",
      performedBy: "system",
      targetType: "security",
      details: { budget: BUDGET_PER_WINDOW, windowMs: WINDOW_MS },
      outcome: "failure",
      severity: "critical",
      category: "security",
    }).catch(() => {});
  }
  return false;
}

export interface SecurityAuditInput {
  event: SecurityEvent;
  /** Uid cuando se conoce; `anonymous` cuando el token no se pudo verificar. */
  uid?: string;
  /** Detalles del evento. Nunca el token, ni el motivo visible para quien llama. */
  details?: Record<string, unknown>;
  req?: Request;
}

/**
 * Registra un evento de seguridad según su nivel.
 *
 * Nunca lanza y nunca se espera: si esto fallara, no debe tumbar la respuesta
 * de seguridad que lo motivó (un 403 tiene que salir igual).
 */
export function recordSecurityEvent(input: SecurityAuditInput): void {
  const { event, uid, details, req } = input;
  const spec: SecurityEventSpec = SECURITY_EVENTS[event];
  const nowMs = Date.now();
  const performedBy = uid ?? "anonymous";
  const ipPrefix = req?.auditContext?.ipPrefix ?? null;

  // Siempre, para todos los niveles, sin condiciones. Es el registro completo.
  logger.warn(event, {
    ...details,
    performedBy,
    severity: spec.severity,
    requestId: req?.auditContext?.requestId,
    route: req?.auditContext?.route ?? req?.path,
    ip: req?.ip ?? null,
  });

  if (spec.tier === "log-only") return;

  if (spec.tier === "rollup") {
    const key = `${event}:${ipPrefix ?? "-"}:${performedBy}`;
    const bucket = buckets.get(key);

    if (bucket && nowMs - bucket.windowStart < WINDOW_MS) {
      // Dentro de la ventana: solo cuenta. El volcado ocurre en la siguiente
      // aparición pasada la ventana. Una evicción puede perder un rollup
      // pendiente y se acepta: la fila de la primera aparición ya existe y
      // Cloud Logging tiene todas. Un scheduler para volcarlo costaría más
      // complejidad de la que vale un contador.
      bucket.count += 1;
      return;
    }

    const carried = bucket
      ? { count: bucket.count, firstAt: bucket.firstAt }
      : null;
    buckets.set(key, { count: 1, firstAt: nowMs, windowStart: nowMs });

    if (!withinBudget(nowMs)) return;

    void writeAuditLog(
      {
        action: event,
        performedBy,
        targetType: "security",
        details: {
          ...details,
          ipPrefix,
          // La primera aparición escribe de inmediato: un sondeo único tiene
          // que verse en segundos, que es el sentido de un cable trampa. Si la
          // ventana anterior acumuló repeticiones, viajan aquí en vez de
          // perderse — es la diferencia entre "pasó una vez" y "pasó 400
          // veces y solo se ve la primera".
          ...(carried && carried.count > 1
            ? {
                previousWindowCount: carried.count,
                previousWindowFirstAt: new Date(carried.firstAt).toISOString(),
              }
            : {}),
        },
        outcome: "denied",
        severity: spec.severity,
        category: "security",
      },
      req
    ).catch(() => {});
    return;
  }

  if (!withinBudget(nowMs)) return;

  void writeAuditLog(
    {
      action: event,
      performedBy,
      targetType: "security",
      details: { ...details, ipPrefix },
      outcome: "denied",
      severity: spec.severity,
      category: "security",
    },
    req
  ).catch(() => {});
}
