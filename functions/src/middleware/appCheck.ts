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
export async function readAppCheckEnforcement(): Promise<boolean> {
  try {
    const snap = await admin
      .firestore()
      .collection("settings")
      .doc("appcheck")
      .get();
    return snap.data()?.enforce === true;
  } catch (err) {
    // Fail open: a settings read failure must not close public
    // registration. The endpoint still has its rate limit and its cap.
    logger.warn("Could not read the App Check enforcement setting", { err });
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
export function verifyAppCheck() {
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

    const enforce = await readAppCheckEnforcement();

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
      details: { hadToken: Boolean(token), enforced: enforce },
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
