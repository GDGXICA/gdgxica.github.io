import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Orden en que ocurrieron las cosas. Importa: el espejo a Cloud Logging tiene
 * que emitirse ANTES de escribir en Firestore en el camino no atómico, y
 * DESPUÉS del commit en el atómico, y las dos cosas son afirmaciones sobre
 * secuencia, no sobre contenido.
 */
const timeline: string[] = [];
const written: { path: string; data: Record<string, unknown> }[] = [];
let addFails = false;
let generatedIds = 0;

function docRef(path: string) {
  return { __path: path, id: path.split("/").pop() as string };
}

function batchMock() {
  const ops: (() => void)[] = [];
  const api = {
    set: (ref: { __path: string }, data: Record<string, unknown>) => {
      ops.push(() => {
        timeline.push(`set:${ref.__path}`);
        written.push({ path: ref.__path, data });
      });
      return api;
    },
    commit: async () => {
      timeline.push("commit");
      ops.forEach((apply) => apply());
      ops.length = 0;
    },
  };
  return api;
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: (name: string) => ({
      doc: (id?: string) => docRef(`${name}/${id ?? `gen-${++generatedIds}`}`),
      add: async (data: Record<string, unknown>) => {
        timeline.push("firestore.add");
        if (addFails) throw new Error("firestore down");
        const id = `gen-${++generatedIds}`;
        written.push({ path: `${name}/${id}`, data });
        return { id };
      },
    }),
    batch: () => batchMock(),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
}));

// `vi.hoisted` porque `vi.mock` se iza al principio del archivo: un `const`
// normal aquí todavía no estaría inicializado cuando corre la factoría.
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions", () => ({ logger: loggerMock }));

import {
  buildAuditEntry,
  commitWithAuditLog,
  stageAuditLog,
  writeAuditLog,
} from "./audit";

/** Un `req` como el que dejan `requirePermission` + `auditContext`. */
function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: "181.65.42.117",
    auditContext: {
      requestId: "req-1",
      method: "PATCH",
      route: "/api/users/:uid/role",
      ipPrefix: "181.65.42.0/24",
      userAgent: "Mozilla/5.0",
    },
    user: {
      uid: "actor-1",
      email: "actor@example.com",
      role: "admin",
      scope: "*",
    },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  timeline.length = 0;
  written.length = 0;
  addFails = false;
  generatedIds = 0;
  // Las implementaciones se reinstalan aquí, no en la factoría izada, porque
  // esta necesita cerrar sobre `timeline` y la factoría corre antes de que
  // exista.
  loggerMock.info
    .mockReset()
    .mockImplementation(() => timeline.push("log.info"));
  loggerMock.warn
    .mockReset()
    .mockImplementation(() => timeline.push("log.warn"));
  loggerMock.error
    .mockReset()
    .mockImplementation(() => timeline.push("log.error"));
});

describe("buildAuditEntry — valores derivados", () => {
  it("sella la marca de tiempo cuando falta", () => {
    const entry = buildAuditEntry({ action: "event.create", performedBy: "u" });
    expect(entry.timestamp).toBe("__TS__");
  });

  // `minigameRoulette` comparte a propósito el mismo serverTimestamp entre la
  // mutación y su registro, para que las dos filas lleven la misma hora.
  it("respeta la marca de tiempo que pasa quien llama", () => {
    const own = "__SHARED__" as unknown as never;
    const entry = buildAuditEntry({
      action: "minigame_instance.roulette.spin",
      performedBy: "u",
      timestamp: own,
    });
    expect(entry.timestamp).toBe("__SHARED__");
  });

  it("por defecto el resultado es success", () => {
    expect(
      buildAuditEntry({ action: "event.create", performedBy: "u" }).outcome
    ).toBe("success");
  });

  it.each([
    ["event.create", "content"],
    ["user.role.change", "access"],
    ["access.invitation.redeem", "access"],
    ["credential.create", "operations"],
    ["minigame_instance.state.live", "minigame"],
    ["security.permission.denied", "security"],
  ])("deduce la categoría de %s → %s", (action, category) => {
    expect(buildAuditEntry({ action, performedBy: "u" }).category).toBe(
      category
    );
  });

  // Asignar staff concede permisos dentro de un evento, así que cuenta como
  // control de acceso y no como contenido, pese a empezar por `event.`.
  it("clasifica event.staff.* como acceso, no como contenido", () => {
    expect(
      buildAuditEntry({ action: "event.staff.assign", performedBy: "u" })
        .category
    ).toBe("access");
  });

  it("sube la severidad de los cambios de acceso por encima del contenido", () => {
    expect(
      buildAuditEntry({ action: "user.role.change", performedBy: "u" }).severity
    ).toBe("notice");
    expect(
      buildAuditEntry({ action: "event.create", performedBy: "u" }).severity
    ).toBe("info");
  });

  it("un fallo es warning aunque la categoría sea inocua", () => {
    expect(
      buildAuditEntry({
        action: "event.create",
        performedBy: "u",
        outcome: "failure",
      }).severity
    ).toBe("warning");
  });

  it("respeta la severidad explícita", () => {
    expect(
      buildAuditEntry({
        action: "security.account.suspended_access",
        performedBy: "u",
        severity: "critical",
      }).severity
    ).toBe("critical");
  });

  it("saca actor y contexto del req", () => {
    const entry = buildAuditEntry(
      { action: "user.role.change", performedBy: "actor-1" },
      buildReq()
    );
    expect(entry.actor).toEqual({
      uid: "actor-1",
      email: "actor@example.com",
      role: "admin",
      scope: "*",
    });
    expect(entry.context?.requestId).toBe("req-1");
    expect(entry.context?.ipPrefix).toBe("181.65.42.0/24");
  });

  // Firestore rechaza `undefined`, así que dejar los campos a undefined
  // convertiría una entrada sin contexto en una escritura fallida.
  it("omite actor y contexto en vez de dejarlos en undefined", () => {
    const entry = buildAuditEntry({ action: "event.create", performedBy: "u" });
    expect("actor" in entry).toBe(false);
    expect("context" in entry).toBe(false);
  });

  // `requireAuth()` deja role en null a propósito; el registro tiene que
  // reflejar eso y no inventarse un rol.
  it("guarda role null cuando solo se verificó el token", () => {
    const req = buildReq({
      user: { uid: "anon", email: "", role: null, scope: "*" },
    } as unknown as Partial<Request>);
    expect(
      buildAuditEntry({ action: "x.y", performedBy: "anon" }, req).actor
    ).toEqual({ uid: "anon", email: null, role: null, scope: "*" });
  });
});

describe("writeAuditLog — camino no atómico", () => {
  it("espeja a Cloud Logging ANTES de escribir en Firestore", async () => {
    await writeAuditLog({ action: "event.create", performedBy: "u" });
    expect(timeline).toEqual(["log.info", "firestore.add"]);
  });

  // Es la razón de ser del espejo: si Firestore falla, la línea de Cloud
  // Logging es el único registro que queda de lo que pasó.
  it("el espejo sobrevive a un fallo de Firestore", async () => {
    addFails = true;
    await writeAuditLog({ action: "event.create", performedBy: "u" });
    expect(loggerMock.info).toHaveBeenCalledOnce();
    expect(loggerMock.error).toHaveBeenCalledOnce();
  });

  it("se traga el fallo por defecto", async () => {
    addFails = true;
    await expect(
      writeAuditLog({ action: "event.create", performedBy: "u" })
    ).resolves.toBeUndefined();
  });

  it("relanza el fallo con critical", async () => {
    addFails = true;
    await expect(
      writeAuditLog({ action: "event.create", performedBy: "u" }, undefined, {
        critical: true,
      })
    ).rejects.toThrow("firestore down");
  });

  it("usa warn para lo notable y info para el resto", async () => {
    await writeAuditLog({ action: "event.create", performedBy: "u" });
    expect(loggerMock.info).toHaveBeenCalledOnce();
    expect(loggerMock.warn).not.toHaveBeenCalled();

    await writeAuditLog({
      action: "security.permission.denied",
      performedBy: "u",
    });
    expect(loggerMock.warn).toHaveBeenCalledOnce();
  });

  // La red de seguridad automática de la respuesta consulta esta marca para no
  // duplicar. Sin ella, cada mutación bien auditada dejaría además una fila
  // sintética.
  it("marca la petición como auditada", async () => {
    const req = buildReq();
    await writeAuditLog({ action: "event.create", performedBy: "u" }, req);
    expect(req.auditClaimed).toBe(true);
  });

  it("manda la IP completa a Cloud Logging pero solo el prefijo a Firestore", async () => {
    await writeAuditLog(
      { action: "user.role.change", performedBy: "actor-1" },
      buildReq()
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      "audit",
      expect.objectContaining({ ip: "181.65.42.117" })
    );
    const stored = written[0].data as { context?: { ipPrefix?: string } };
    expect(stored.context?.ipPrefix).toBe("181.65.42.0/24");
    expect(JSON.stringify(stored)).not.toContain("181.65.42.117");
  });
});

describe("stageAuditLog — camino atómico", () => {
  it("deja la entrada preparada sin escribir nada todavía", () => {
    const batch = batchMock();
    stageAuditLog(batch, { action: "user.role.change", performedBy: "u" });
    expect(written).toHaveLength(0);
  });

  // El callback de una transacción se puede reintentar; espejar dentro dejaría
  // una línea por intento contando como hechas cosas que Firestore descartó.
  it("no espeja a Cloud Logging por su cuenta", () => {
    const batch = batchMock();
    stageAuditLog(batch, { action: "user.role.change", performedBy: "u" });
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("devuelve la entrada ya completada", () => {
    const stored = stageAuditLog(batchMock(), {
      action: "user.role.change",
      performedBy: "u",
    });
    expect(stored).toMatchObject({
      category: "access",
      outcome: "success",
      severity: "notice",
      timestamp: "__TS__",
    });
  });
});

describe("commitWithAuditLog", () => {
  it("escribe la entrada dentro del batch y espeja tras el commit", async () => {
    const batch = batchMock();
    await commitWithAuditLog(batch, {
      action: "user.role.change",
      performedBy: "u",
    });
    // El `set` ocurre al confirmar, y el espejo después: nada se anuncia antes
    // de que Firestore lo haya aceptado.
    expect(timeline).toEqual(["commit", "set:audit_log/gen-1", "log.info"]);
  });

  it("no espeja nada si el commit falla", async () => {
    const batch = {
      set: () => batch,
      commit: async () => {
        throw new Error("batch rejected");
      },
    } as unknown as Parameters<typeof commitWithAuditLog>[0];

    await expect(
      commitWithAuditLog(batch, {
        action: "user.role.change",
        performedBy: "u",
      })
    ).rejects.toThrow("batch rejected");
    // Anunciar un cambio de rol que la base rechazó es peor que no anunciarlo.
    expect(loggerMock.info).not.toHaveBeenCalled();
  });
});

describe("valores undefined", () => {
  it("elimina claves undefined de details", () => {
    const entry = buildAuditEntry({
      action: "security.invitation.redeem_failed",
      performedBy: "u1",
      details: { reason: "no_match", email: "a@b.c", invitationId: undefined },
    });
    const details = entry.details as Record<string, unknown>;
    expect("invitationId" in details).toBe(false);
    expect(details).toEqual({ reason: "no_match", email: "a@b.c" });
  });

  it("conserva null, cero y cadena vacía", () => {
    const entry = buildAuditEntry({
      action: "event.update",
      performedBy: "u1",
      details: { previousRole: null, count: 0, note: "", gone: undefined },
    });
    expect(entry.details).toEqual({ previousRole: null, count: 0, note: "" });
  });

  it("limpia también dentro de objetos anidados y arrays", () => {
    const entry = buildAuditEntry({
      action: "user.grants.change",
      performedBy: "u1",
      details: {
        grants: [
          { permission: "audit:read", scope: "*", expiresAt: undefined },
        ],
        nested: { a: 1, b: undefined },
      },
    });
    const d = entry.details as Record<string, unknown>;
    expect((d.grants as Record<string, unknown>[])[0]).toEqual({
      permission: "audit:read",
      scope: "*",
    });
    expect(d.nested).toEqual({ a: 1 });
  });

  it("no destruye el sentinel de timestamp", () => {
    const entry = buildAuditEntry({ action: "event.create", performedBy: "u" });
    expect(entry.timestamp).toBe("__TS__");
  });

  it("conserva instancias de Date", () => {
    const when = new Date("2026-07-30T00:00:00Z");
    const entry = buildAuditEntry({
      action: "event.create",
      performedBy: "u",
      details: { when },
    });
    expect((entry.details as Record<string, unknown>).when).toBe(when);
  });

  it("escribe en Firestore una entrada que traía undefined", async () => {
    await writeAuditLog({
      action: "security.invitation.redeem_failed",
      performedBy: "u1",
      details: { reason: "no_match", invitationId: undefined },
    });
    expect(written).toHaveLength(1);
    expect(JSON.stringify(written[0].data)).not.toContain("invitationId");
  });
});
