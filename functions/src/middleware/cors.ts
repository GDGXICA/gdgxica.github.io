import { Request, Response, NextFunction } from "express";
import { logger } from "firebase-functions";

export const ALLOWED_ORIGINS = [
  "https://gdgica.com",
  "https://appgdgica.web.app",
  "https://appgdgica.firebaseapp.com",
  "http://localhost:4321",
];

// Any loopback host, with or without a port. Astro moves to the next free
// port when 4321 is taken (a second dev server, a leftover process), and
// some machines resolve localhost to IPv6, so the browser sends
// http://[::1]:4321. Pinning a single origin meant every API call failed
// and the only symptom was an opaque error.
const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Read at call time rather than captured at module load, so tests can
 * exercise both sides of the branch. FUNCTIONS_EMULATOR is set by the
 * emulator itself and never exists in a deployed function.
 */
function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

/**
 * The deployed allowlist is exactly ALLOWED_ORIGINS. The loopback bypass
 * is gated on the emulator, so a development convenience can never widen
 * what production accepts.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return isEmulator() && LOCALHOST_RE.test(origin);
}

// Origin is caller-controlled and unbounded. It is echoed back to make the
// failure diagnosable, so cap it: otherwise a caller can inflate response
// bodies and log entries at will, one large string per request.
const MAX_ECHOED_ORIGIN = 200;

const truncate = (s: string) =>
  s.length <= MAX_ECHOED_ORIGIN ? s : `${s.slice(0, MAX_ECHOED_ORIGIN)}…`;

/**
 * Rejects disallowed origins with a legible 403, replacing an opaque 500.
 *
 * Registered BEFORE cors(), which defaults to preflightContinue: false and
 * so answers OPTIONS itself without calling next(). Anything after it is
 * dead code for a preflight.
 *
 * SCOPE, measured rather than assumed: running first is still not enough
 * to cover preflight. Against the emulator, an OPTIONS from a disallowed
 * origin returns 204 and this middleware's log line never fires — the
 * function is invoked, so the request arrives, but something ahead of the
 * express app answers it. So:
 *
 *   - simple requests get the 403;
 *   - preflighted ones (every POST with a JSON body) still surface to the
 *     caller as a generic browser CORS message.
 *
 * Security is unaffected either way: Access-Control-Allow-Origin is
 * attached only for allowed origins, so the browser blocks the real
 * request regardless. The gap is diagnostics. Closing it means moving the
 * check above express — into the onRequest/Hosting layer — not reordering
 * middleware here, which has already been tried.
 *
 * Requests with no Origin header (server-to-server, curl, health checks)
 * pass through untouched, matching the cors() configuration.
 */
export function rejectDisallowedOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    const shown = truncate(origin);
    logger.warn("Blocked request from disallowed origin", { origin: shown });
    res.status(403).json({
      success: false,
      error: `Origen no permitido: ${shown}`,
    });
    return;
  }
  next();
}
