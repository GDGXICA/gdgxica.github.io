import type { Request } from "express";
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

import {
  __resetSecurityAuditState,
  recordSecurityEvent,
  SECURITY_EVENTS,
} from "./securityAudit";

function buildReq(ipPrefix = "181.65.42.0/24"): Request {
  return {
    ip: "181.65.42.117",
    path: "/api/users",
    auditContext: {
      requestId: "req-1",
      method: "GET",
      route: "/api/users",
      ipPrefix,
      userAgent: "Mozilla/5.0",
    },
  } as unknown as Request;
}

/** `writeAuditLog` se llama sin await a propósito; hay que dejar correr la cola. */
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  written.length = 0;
  __resetSecurityAuditState();
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
});

describe("nivel log-only", () => {
  // Un token caducado lo produce cualquier pestaña abierta más de una hora, y
  // provocarlo no requiere cuenta: en Firestore sería ruido indistinguible de
  // un ataque Y un amplificador de una petición a una escritura.
  it("el token inválido NUNCA llega a Firestore", async () => {
    for (let i = 0; i < 50; i++) {
      recordSecurityEvent({
        event: "security.auth.invalid_token",
        req: buildReq(),
      });
    }
    await flush();
    expect(written).toHaveLength(0);
  });

  it("pero sí deja línea de log, que antes no existía", async () => {
    recordSecurityEvent({
      event: "security.auth.invalid_token",
      req: buildReq(),
    });
    await flush();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "security.auth.invalid_token",
      expect.objectContaining({ requestId: "req-1" })
    );
  });

  it("App Check ausente tampoco llega a Firestore", async () => {
    recordSecurityEvent({
      event: "security.appcheck.missing",
      details: { hadToken: false },
      req: buildReq(),
    });
    await flush();
    expect(written).toHaveLength(0);
    expect(loggerMock.warn).toHaveBeenCalledOnce();
  });
});

describe("nivel always", () => {
  it("la denegación de permiso escribe siempre", async () => {
    recordSecurityEvent({
      event: "security.permission.denied",
      uid: "u1",
      details: { permission: "users:read", role: "member" },
      req: buildReq(),
    });
    await flush();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      action: "security.permission.denied",
      performedBy: "u1",
      category: "security",
      outcome: "denied",
      severity: "warning",
    });
  });

  // Provocarlo exige poseer una cuenta suspendida, así que no hay volumen que
  // temer, y es la señal más limpia de una cuenta comprometida.
  it("la cuenta suspendida es critical", async () => {
    recordSecurityEvent({
      event: "security.account.suspended_access",
      uid: "u2",
      req: buildReq(),
    });
    await flush();
    expect(written[0]).toMatchObject({ severity: "critical" });
  });

  it("no agrupa: cinco intentos dejan cinco filas", async () => {
    for (let i = 0; i < 5; i++) {
      recordSecurityEvent({
        event: "security.invitation.redeem_failed",
        uid: "u1",
        details: { reason: "no_match" },
        req: buildReq(),
      });
    }
    await flush();
    expect(written).toHaveLength(5);
  });

  // El motivo real se guarda aunque la respuesta HTTP sea siempre idéntica:
  // solo lo ve quien tiene `audit:read`, así que no filtra nada.
  it("guarda el motivo discriminado del canje fallido", async () => {
    recordSecurityEvent({
      event: "security.invitation.redeem_failed",
      uid: "u1",
      details: { reason: "revoked", invitationId: "inv-1" },
      req: buildReq(),
    });
    await flush();
    expect(written[0].details).toMatchObject({
      reason: "revoked",
      invitationId: "inv-1",
    });
  });

  it("guarda el prefijo de red, no la dirección", async () => {
    recordSecurityEvent({
      event: "security.permission.denied",
      uid: "u1",
      req: buildReq(),
    });
    await flush();
    expect(written[0].details).toMatchObject({ ipPrefix: "181.65.42.0/24" });
    expect(JSON.stringify(written[0])).not.toContain("181.65.42.117");
    // La completa sí va a Cloud Logging.
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "security.permission.denied",
      expect.objectContaining({ ip: "181.65.42.117" })
    );
  });
});

describe("nivel rollup", () => {
  // Un sondeo único tiene que verse en segundos: es el sentido de un cable
  // trampa. Agrupar desde la primera lo haría invisible durante un minuto.
  it("la primera aparición escribe de inmediato", async () => {
    recordSecurityEvent({
      event: "security.user.unregistered",
      uid: "u1",
      req: buildReq(),
    });
    await flush();
    expect(written).toHaveLength(1);
  });

  it("las repeticiones dentro de la ventana solo cuentan", async () => {
    for (let i = 0; i < 30; i++) {
      recordSecurityEvent({
        event: "security.user.unregistered",
        uid: "u1",
        req: buildReq(),
      });
    }
    await flush();
    expect(written).toHaveLength(1);
  });

  it("separa por red: dos redes distintas son dos filas", async () => {
    recordSecurityEvent({
      event: "security.ratelimit.exceeded",
      req: buildReq("10.0.0.0/24"),
    });
    recordSecurityEvent({
      event: "security.ratelimit.exceeded",
      req: buildReq("192.168.1.0/24"),
    });
    await flush();
    expect(written).toHaveLength(2);
  });

  // Sin arrastrar el contador, "pasó 400 veces" se leería como "pasó una vez".
  it("pasada la ventana, arrastra el recuento de la anterior", async () => {
    vi.useFakeTimers();
    try {
      recordSecurityEvent({
        event: "security.user.unregistered",
        uid: "u1",
        req: buildReq(),
      });
      for (let i = 0; i < 9; i++) {
        recordSecurityEvent({
          event: "security.user.unregistered",
          uid: "u1",
          req: buildReq(),
        });
      }
      vi.advanceTimersByTime(61_000);
      recordSecurityEvent({
        event: "security.user.unregistered",
        uid: "u1",
        req: buildReq(),
      });
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(written).toHaveLength(2);
    expect(written[1].details).toMatchObject({ previousWindowCount: 10 });
  });
});

describe("presupuesto", () => {
  // Un registro truncado sin aviso se lee como "no pasó nada más", que es la
  // conclusión contraria a la verdad.
  it("al agotarse avisa una sola vez y deja de escribir", async () => {
    // 30 es el techo por instancia y minuto; se piden 60 con claves distintas
    // para que el rollup no las agrupe.
    for (let i = 0; i < 60; i++) {
      recordSecurityEvent({
        event: "security.permission.denied",
        uid: `u${i}`,
        req: buildReq(),
      });
    }
    await flush();

    const throttled = written.filter(
      (w) => w.action === "security.audit.throttled"
    );
    const denials = written.filter(
      (w) => w.action === "security.permission.denied"
    );

    expect(denials).toHaveLength(30);
    expect(throttled).toHaveLength(1);
    expect(throttled[0]).toMatchObject({
      severity: "critical",
      performedBy: "system",
    });
  });

  it("Cloud Logging sigue recibiendo TODO aunque Firestore se corte", async () => {
    for (let i = 0; i < 60; i++) {
      recordSecurityEvent({
        event: "security.permission.denied",
        uid: `u${i}`,
        req: buildReq(),
      });
    }
    await flush();
    // El registro completo vive en Cloud Logging; Firestore es el subconjunto
    // revisable. Esa asimetría es el diseño, no una carencia.
    const denialLogs = loggerMock.warn.mock.calls.filter(
      (c) => c[0] === "security.permission.denied"
    );
    expect(denialLogs).toHaveLength(60);
  });

  it("el presupuesto se reinicia al rodar la ventana", async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 60; i++) {
        recordSecurityEvent({
          event: "security.permission.denied",
          uid: `u${i}`,
          req: buildReq(),
        });
      }
      vi.advanceTimersByTime(61_000);
      recordSecurityEvent({
        event: "security.permission.denied",
        uid: "despues",
        req: buildReq(),
      });
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(written.filter((w) => w.performedBy === "despues")).toHaveLength(1);
  });
});

describe("catálogo de eventos", () => {
  // El nivel de cada evento es una decisión de seguridad, no un detalle: subir
  // uno a `always` por descuido abre un amplificador para quien no tiene cuenta.
  it("los eventos que cualquiera puede provocar sin cuenta son log-only", () => {
    expect(SECURITY_EVENTS["security.auth.invalid_token"].tier).toBe(
      "log-only"
    );
    expect(SECURITY_EVENTS["security.appcheck.missing"].tier).toBe("log-only");
  });

  it("los que exigen identidad autenticada escriben siempre", () => {
    expect(SECURITY_EVENTS["security.permission.denied"].tier).toBe("always");
    expect(SECURITY_EVENTS["security.account.suspended_access"].tier).toBe(
      "always"
    );
    expect(SECURITY_EVENTS["security.invitation.redeem_failed"].tier).toBe(
      "always"
    );
  });

  it("nunca lanza, ni sin req ni sin uid", () => {
    expect(() =>
      recordSecurityEvent({ event: "security.permission.denied" })
    ).not.toThrow();
  });
});
