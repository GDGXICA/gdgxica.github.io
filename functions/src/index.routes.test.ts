import { describe, expect, it, vi } from "vitest";

/**
 * La garantía de cobertura de auditoría.
 *
 * La red de seguridad de `middleware/auditContext.ts` es el modo degradado: si
 * un handler futuro se olvida de auditar, deja una fila `synthesized: true` que
 * dice "aquí alguien cambió algo y el código no dijo qué". Mejor que el
 * silencio, pero sigue siendo una fila sin `targetId` ni detalles, y hay que
 * darse cuenta de que está.
 *
 * Este test es la garantía de verdad: recorre la tabla de rutas real de express
 * y exige que cada ruta que muta esté clasificada explícitamente abajo. Añadir
 * una ruta sin decidir si audita **rompe CI**, que es la única forma de que la
 * decisión no se posponga hasta que haga falta el registro y no esté.
 */

vi.mock("firebase-admin", () => ({
  initializeApp: vi.fn(),
  firestore: () => ({ collection: () => ({}) }),
  auth: () => ({}),
  appCheck: () => ({}),
  storage: () => ({}),
}));

vi.mock("firebase-functions", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Bajo este mock, `api` ES la app de express en vez de una Cloud Function
// envuelta, así que se puede inspeccionar su router.
vi.mock("firebase-functions/v2/https", () => ({
  onRequest: (_opts: unknown, app: unknown) => app,
}));

vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => "" }),
}));

vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: () => ({}),
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: () => ({}),
}));

import { api } from "./index";

/**
 * Rutas que mutan y dejan constancia. Son todas: los seis huecos que quedaban
 * —register, la solicitud de acceso, el rebuild, crear y editar propuestas, y
 * la subida de imagen de credencial— se cerraron en este mismo cambio.
 */
const AUDITED_ROUTES = [
  "POST /api/auth/register",
  "POST /api/events",
  "PUT /api/events/:id",
  "DELETE /api/events/:id",
  "POST /api/team",
  "PUT /api/team/:id",
  "DELETE /api/team/:id",
  "POST /api/speakers",
  "PUT /api/speakers/:id",
  "DELETE /api/speakers/:id",
  "POST /api/sponsors",
  "PUT /api/sponsors/:id",
  "DELETE /api/sponsors/:id",
  "PUT /api/stats",
  "PATCH /api/users/:uid/role",
  "PATCH /api/users/:uid/status",
  "PUT /api/users/:uid/grants",
  "POST /api/proposals",
  "PUT /api/proposals/:id",
  "POST /api/proposals/:id/review",
  "POST /api/proposals/:id/publish",
  "PUT /api/events/:slug/staff/:uid",
  "DELETE /api/events/:slug/staff/:uid",
  "POST /api/access/requests",
  "POST /api/access/invitations/redeem",
  "POST /api/access/requests/:uid/decide",
  "POST /api/access/invitations",
  "DELETE /api/access/invitations/:id",
  "POST /api/forms",
  "PUT /api/forms/:id",
  "DELETE /api/forms/:id",
  "POST /api/locations",
  "PUT /api/locations/:id",
  "DELETE /api/locations/:id",
  "POST /api/minigame-templates",
  "PUT /api/minigame-templates/:id",
  "DELETE /api/minigame-templates/:id",
  "POST /api/events/:slug/minigames",
  "PATCH /api/events/:slug/minigames/:id/state",
  "POST /api/events/:slug/minigames/:id/quiz/advance",
  "DELETE /api/events/:slug/minigames/:id",
  "POST /api/events/:slug/minigames/join",
  "POST /api/events/:slug/credentials",
  "PATCH /api/events/:slug/credentials/:id/image",
  "PATCH /api/events/:slug/credentials/:id/bevy",
  "PATCH /api/events/:slug/credentials/:id/photo",
  "POST /api/events/:slug/credentials/:id/email/retry",
  "POST /api/events/:slug/credentials/reminders",
  "POST /api/events/:slug/credentials/reconcile",
  "PUT /api/settings/email",
  "POST /api/events/:slug/minigames/:id/roulette/spin",
  "POST /api/events/:slug/minigames/:id/bingo/draw",
  "POST /api/events/:slug/minigames/:id/bingo/claim",
  "PATCH /api/events/:slug/minigames/:id/words/:wordId/hidden",
  "POST /api/certificates/send",
  "POST /api/events/:slug/checkin/import",
  "POST /api/rebuild",
];

/**
 * Rutas que mutan y NO auditan a propósito.
 *
 * Está vacía, y que lo esté es el objetivo. Si algo entra aquí, tiene que
 * llevar al lado el motivo por el que no auditar es la decisión correcta —no
 * "aún no lo hemos hecho"—, porque cualquiera que lea el registro va a asumir
 * que están todas.
 */
const UNAUDITED_BY_DESIGN: string[] = [];

const MUTATING = /^(POST|PUT|PATCH|DELETE) /;

/** Recorre la tabla de rutas real de express. */
function registeredRoutes(): string[] {
  const stack = (
    api as unknown as {
      router: {
        stack: {
          route?: { path: string; methods: Record<string, boolean> };
        }[];
      };
    }
  ).router.stack;

  return stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods)
          .filter((m) => m !== "_all")
          .map((m) => `${m.toUpperCase()} ${layer.route!.path}`)
      : []
  );
}

describe("cobertura de auditoría de las rutas", () => {
  it("expone la tabla de rutas para poder inspeccionarla", () => {
    // Si esto falla, express cambió cómo expone su router y el resto del test
    // estaría pasando en vacío — que es peor que fallar.
    expect(registeredRoutes().length).toBeGreaterThan(50);
  });

  it("toda ruta que muta está clasificada", () => {
    const mutating = registeredRoutes().filter((r) => MUTATING.test(r));
    const classified = new Set([...AUDITED_ROUTES, ...UNAUDITED_BY_DESIGN]);

    const unclassified = mutating.filter((r) => !classified.has(r));
    expect(
      unclassified,
      "Ruta que muta sin clasificar. Audítala y añádela a AUDITED_ROUTES, o " +
        "justifica por qué no en UNAUDITED_BY_DESIGN."
    ).toEqual([]);
  });

  // La lista se queda obsoleta en la otra dirección: una ruta que se renombra o
  // se borra dejaría una entrada muerta, y con ella la falsa impresión de que
  // algo está cubierto.
  it("no quedan entradas muertas en la clasificación", () => {
    const mutating = new Set(
      registeredRoutes().filter((r) => MUTATING.test(r))
    );
    const stale = [...AUDITED_ROUTES, ...UNAUDITED_BY_DESIGN].filter(
      (r) => !mutating.has(r)
    );
    expect(stale, "Entrada que ya no corresponde a ninguna ruta.").toEqual([]);
  });

  it("no hay rutas duplicadas en la clasificación", () => {
    const all = [...AUDITED_ROUTES, ...UNAUDITED_BY_DESIGN];
    expect(all.length).toBe(new Set(all).size);
  });
});
