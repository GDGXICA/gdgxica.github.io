import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { recordSecurityEvent } from "../utils/securityAudit";

// App Check verification for the public credential endpoints.
//
// Those endpoints accept anonymous Firebase tokens, which any client mints
// for free from anywhere. That makes them callable by a script that never
// loaded our page. App Check closes that: the browser proves, via
// reCAPTCHA, that the call came from our web app before the request is
// accepted.
//
// The per-IP limiter and the per-event cap bound the damage; this is what
// stops it at the door.

const HEADER = "x-firebase-appcheck";

/**
 * Enforcement lives in Firestore so it can be turned off without a deploy.
 *
 * That switch is the whole reason this rolls out in two steps. A false
 * rejection costs a registration — someone with an extension blocking
 * reCAPTCHA, or a corporate proxy — and finding that out mid-event with no
 * way to disable it would be worse than the abuse it prevents. Start
 * unenforced, watch the logs, then turn it on.
 */
/**
 * Último valor leído con éxito, por instancia.
 *
 * Existe porque caer a `false` ante un error de lectura desactiva App Check en
 * silencio: un parpadeo de Firestore bastaba para que la protección se apagara
 * sin que nada lo dijera, y volviera sola cuando la lectura funcionase otra vez.
 * Eso es lo peor de los dos mundos — ni protege ni avisa de que no protege.
 *
 * Con la caché, un error transitorio conserva la última decisión conocida. La
 * primera lectura de una instancia sigue cayendo a `false` si falla, y eso se
 * mantiene a propósito: sin ningún valor conocido, cerrar el paso convertiría un
 * problema de Firestore en asistentes que no pueden sacar su credencial en
 * mitad de un evento.
 */
interface AppCheckSettings {
  enforce: boolean;

  areas: Record<string, boolean>;
}

let cachedSettings: AppCheckSettings | null = null;

/** Solo para los tests: olvida el valor cacheado. */
export function __resetAppCheckCache(): void {
  cachedSettings = null;
}

function parseSettings(
  data: Record<string, unknown> | undefined
): AppCheckSettings {
  const areas: Record<string, boolean> = {};
  const raw = data?.areas;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [area, value] of Object.entries(
      raw as Record<string, unknown>
    )) {
      if (typeof value === "boolean") areas[area] = value;
    }
  }
  return { enforce: data?.enforce === true, areas };
}

function resolveFor(settings: AppCheckSettings, area?: string): boolean {
  if (area !== undefined && area in settings.areas) return settings.areas[area];
  return settings.enforce;
}

export async function readAppCheckEnforcement(area?: string): Promise<boolean> {
  try {
    const snap = await admin
      .firestore()
      .collection("settings")
      .doc("appcheck")
      .get();
    cachedSettings = parseSettings(snap.data());
    return resolveFor(cachedSettings, area);
  } catch (err) {
    if (cachedSettings !== null) {
      // Se conserva la última decisión conocida en vez de abrir el paso.
      logger.warn(
        "Could not read the App Check enforcement setting; keeping the last known value",
        { err, area, enforce: resolveFor(cachedSettings, area) }
      );
      return resolveFor(cachedSettings, area);
    }
    // Sin valor previo: se abre, con ruido. La alternativa —cerrar sin saber si
    // la exigencia estaba activada— rompería el registro público por un fallo
    // que puede no tener nada que ver.
    logger.warn(
      "Could not read the App Check enforcement setting and there is no cached value",
      { err, area }
    );
    return false;
  }
}

/**
 * Verifies the App Check token when one is present, and rejects only when
 * enforcement is on.
 *
 * Unverified traffic is logged either way, so the decision to enforce can
 * be made against real numbers rather than a guess.
 */
export function verifyAppCheck(area?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.header(HEADER);
    let verified = false;

    if (token) {
      try {
        await admin.appCheck().verifyToken(token);
        verified = true;
      } catch {
        // Deliberately no detail in the log: a malformed token tells us
        // nothing useful and the string is attacker-controlled.
        verified = false;
      }
    }

    if (verified) {
      next();
      return;
    }

    const enforce = await readAppCheckEnforcement(area);

    // Nivel `log-only`: estos endpoints son públicos, así que provocar esto no
    // cuesta nada ni requiere cuenta. Escribirlo en Firestore le daría a
    // cualquiera un amplificador de una petición a una escritura.
    //
    // Es además la medición con la que se decide activar la exigencia: hay que
    // confirmar en estos logs que los clientes reales sí mandan la cabecera
    // ANTES de exigirla, porque src/lib/api.ts la omite en silencio cuando
    // reCAPTCHA falla. Un evento en marcha no es el momento de descubrirlo.
    recordSecurityEvent({
      event: "security.appcheck.missing",
      details: {
        hadToken: Boolean(token),
        enforced: enforce,
        area: area ?? null,
      },
      req,
    });

    if (!enforce) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error:
        "No pudimos verificar que la solicitud venga del sitio de GDG Ica. " +
        "Recarga la página e inténtalo de nuevo.",
    });
  };
}
