import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const written: Record<string, unknown>[] = [];

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions", () => ({ logger: loggerMock }));

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: () => ({
      doc: () => ({ __path: "audit_log/gen" }),
      add: async (data: Record<string, unknown>) => {
        written.push(data);
        return { id: "gen" };
      },
    }),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
}));

import { auditContext, truncateIp } from "./auditContext";

/** Simula el ciclo de vida: entra la petición, responde, se dispara `finish`. */
function run(opts: {
  method?: string;
  path?: string;
  routePath?: string;
  status?: number;
  ip?: string;
  userAgent?: string;
  claimed?: boolean;
  uid?: string;
}) {
  const handlers: (() => void)[] = [];
  const headers: Record<string, string> = {};

  const req = {
    method: opts.method ?? "POST",
    path: opts.path ?? "/api/users/abc/role",
    baseUrl: "",
    ip: opts.ip ?? "181.65.42.117",
    route: opts.routePath ? { path: opts.routePath } : undefined,
    get: (name: string) =>
      name.toLowerCase() === "user-agent" ? opts.userAgent : undefined,
    ...(opts.uid ? { user: { uid: opts.uid } } : {}),
  } as unknown as Request;

  const res = {
    statusCode: opts.status ?? 200,
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    on: (event: string, cb: () => void) => {
      if (event === "finish") handlers.push(cb);
    },
  } as unknown as Response;

  const next = vi.fn();
  auditContext()(req, res, next);

  // El handler reclama la petición DESPUÉS del middleware, como en la realidad.
  if (opts.claimed) req.auditClaimed = true;

  handlers.forEach((h) => h());
  return { req, res, next, headers };
}

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  written.length = 0;
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
});

describe("truncateIp", () => {
  it.each([
    ["181.65.42.117", "181.65.42.0/24"],
    ["10.0.0.1", "10.0.0.0/24"],
    ["255.255.255.255", "255.255.255.0/24"],
  ])("IPv4 %s → %s", (ip, expected) => {
    expect(truncateIp(ip)).toBe(expected);
  });

  // Detrás de un proxy una IPv4 puede llegar mapeada a IPv6; sin desmapear,
  // se guardaría "::ffff:181::/48" y el prefijo perdería todo su sentido.
  it("desmapea la IPv4 embebida en IPv6", () => {
    expect(truncateIp("::ffff:181.65.42.117")).toBe("181.65.42.0/24");
  });

  // /48 y no /64: en IPv6 un /64 es una sola máquina, así que el equivalente
  // honesto al /24 de IPv4 es la asignación de sitio.
  it.each([
    ["2001:db8:1234:5678::1", "2001:db8:1234::/48"],
    ["2001:db8:1234::1", "2001:db8:1234::/48"],
  ])("IPv6 %s → %s", (ip, expected) => {
    expect(truncateIp(ip)).toBe(expected);
  });

  it("no revienta sin dirección", () => {
    expect(truncateIp(undefined)).toBeNull();
    expect(truncateIp("")).toBeNull();
    expect(truncateIp("no-es-una-ip")).toBeNull();
  });

  it("nunca devuelve la dirección completa", () => {
    expect(truncateIp("181.65.42.117")).not.toContain("117");
  });
});

describe("contexto", () => {
  it("pone requestId, método y prefijo, y llama a next()", () => {
    const { req, next } = run({});
    expect(req.auditContext?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.auditContext?.method).toBe("POST");
    expect(req.auditContext?.ipPrefix).toBe("181.65.42.0/24");
    expect(next).toHaveBeenCalledOnce();
  });

  it("expone el requestId en la cabecera para poder citarlo", () => {
    const { req, headers } = run({});
    expect(headers["X-Request-Id"]).toBe(req.auditContext?.requestId);
  });

  // Un user-agent con CRLF puede fingir varias entradas dentro de una: el
  // registro deja de ser fiable justo cuando hay que leerlo.
  it("colapsa saltos de línea del user-agent", () => {
    const { req } = run({
      userAgent: "Mozilla\r\nX-Inyectado: si\ny mas",
    });
    expect(req.auditContext?.userAgent).toBe("Mozilla X-Inyectado: si y mas");
  });

  it("corta el user-agent a 200 caracteres", () => {
    const { req } = run({ userAgent: "a".repeat(500) });
    expect(req.auditContext?.userAgent).toHaveLength(200);
  });

  it("deja el user-agent en null si no viene", () => {
    const { req } = run({});
    expect(req.auditContext?.userAgent).toBeNull();
  });

  // `req.route` solo existe una vez express resolvió el handler, así que el
  // patrón se captura en `finish`. Guardar la ruta concreta metería ids en un
  // campo cuyo único uso es agrupar.
  it("captura el PATRÓN de la ruta, no la ruta concreta", () => {
    const { req } = run({
      path: "/api/users/abc123/role",
      routePath: "/api/users/:uid/role",
    });
    expect(req.auditContext?.route).toBe("/api/users/:uid/role");
  });

  it("cae a la ruta concreta cuando no hay handler resuelto", () => {
    const { req } = run({ path: "/api/no-existe", status: 404 });
    expect(req.auditContext?.route).toBe("/api/no-existe");
  });
});

describe("red de seguridad", () => {
  // Es lo que convierte "un handler se olvidó de auditar" en algo visible.
  it("una mutación sin reclamar deja fila sintética", async () => {
    run({ method: "POST", routePath: "/api/algo-nuevo", uid: "u1" });
    await flush();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      action: "http.post./api/algo-nuevo",
      performedBy: "u1",
      synthesized: true,
      // `warning`, no `info`: significa que hay código mutando sin decir qué.
      severity: "warning",
    });
  });

  // Sin esta comprobación, cada mutación bien auditada dejaría además una fila
  // sintética: el doble de filas y la mitad de credibilidad.
  it("NO duplica cuando el handler ya auditó", async () => {
    run({ method: "POST", claimed: true, uid: "u1" });
    await flush();
    expect(written).toHaveLength(0);
  });

  it("no escribe nada para un GET", async () => {
    run({ method: "GET", routePath: "/api/users" });
    await flush();
    expect(written).toHaveLength(0);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "cubre el método %s",
    async (method) => {
      written.length = 0;
      run({ method, routePath: "/api/x", uid: "u1" });
      await flush();
      expect(written).toHaveLength(1);
    }
  );

  // Un 4xx sin reclamar es casi siempre validación rechazando un cuerpo
  // malformado. Escribirlo haría a cualquiera capaz de mandar basura dueño del
  // volumen de la colección; la línea de log sí queda.
  it("un 4xx sin reclamar solo va a Cloud Logging", async () => {
    run({ method: "POST", status: 400, routePath: "/api/x", uid: "u1" });
    await flush();
    expect(written).toHaveLength(0);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "audit.synthesized",
      expect.objectContaining({ outcome: "denied", status: 400 })
    );
  });

  it("un 500 sin reclamar tampoco escribe, pero se registra como failure", async () => {
    run({ method: "POST", status: 500, routePath: "/api/x", uid: "u1" });
    await flush();
    expect(written).toHaveLength(0);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "audit.synthesized",
      expect.objectContaining({ outcome: "failure" })
    );
  });

  // `finish` corre tras volcar la respuesta: el framework no espera nada async
  // de ahí, así que la línea síncrona es lo único garantizado.
  it("la línea de log se emite de forma síncrona, sin esperar a Firestore", () => {
    run({ method: "POST", routePath: "/api/x", uid: "u1" });
    // Sin `await flush()`: ya tiene que estar.
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "audit.synthesized",
      expect.objectContaining({ action: "http.post./api/x" })
    );
  });

  it("registra unknown si no hay usuario en la petición", async () => {
    run({ method: "POST", routePath: "/api/x" });
    await flush();
    expect(written[0]).toMatchObject({ performedBy: "unknown" });
  });
});
