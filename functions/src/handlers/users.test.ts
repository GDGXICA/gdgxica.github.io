import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Almacén en memoria por ruta de documento; `where()` solo soporta la
// consulta que usa el handler (role == X sobre `users`), que es cuanto hace
// falta para ejercitar la protección del último admin.
const docs = new Map<string, Record<string, unknown>>();
const updates: { path: string; data: Record<string, unknown> }[] = [];

/**
 * Entradas de auditoría realmente escritas en `audit_log`.
 *
 * Antes se recogían mockeando `../utils/audit`, lo que hacía imposible
 * comprobar lo único que de verdad importa aquí: que el registro y la mutación
 * se confirman en el MISMO batch. Con el escritor real corriendo contra este
 * almacén, un batch que no llegue a `commit()` no deja ni mutación ni entrada,
 * que es exactamente la garantía que se quiere.
 */
function auditLogEntries(): Record<string, unknown>[] {
  return [...docs.entries()]
    .filter(([path]) => path.startsWith("audit_log/"))
    .map(([, data]) => data);
}

let generatedIds = 0;

function docRef(path: string) {
  return {
    __path: path,
    id: path.split("/").pop() as string,
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    update: async (data: Record<string, unknown>) => {
      updates.push({ path, data });
      docs.set(path, { ...(docs.get(path) ?? {}), ...data });
    },
  };
}

type DocRef = ReturnType<typeof docRef>;

/**
 * Batch que solo aplica sus operaciones al confirmar. Que nada toque el
 * almacén antes de `commit()` es la mitad del test: es lo que distingue un
 * batch de dos escrituras seguidas.
 */
function batchMock() {
  const staged: (() => void)[] = [];
  const api = {
    update: (ref: DocRef, data: Record<string, unknown>) => {
      staged.push(() => {
        updates.push({ path: ref.__path, data });
        docs.set(ref.__path, { ...(docs.get(ref.__path) ?? {}), ...data });
      });
      return api;
    },
    set: (ref: DocRef, data: Record<string, unknown>) => {
      staged.push(() => docs.set(ref.__path, data));
      return api;
    },
    delete: (ref: DocRef) => {
      staged.push(() => docs.delete(ref.__path));
      return api;
    },
    commit: async () => {
      staged.forEach((apply) => apply());
      staged.length = 0;
    },
  };
  return api;
}

function collectionRef(name: string) {
  return {
    // Sin id para `newAuditRef()`, que deja que Firestore lo genere.
    doc: (id?: string) => docRef(`${name}/${id ?? `gen-${++generatedIds}`}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .filter(([, data]) => data[field] === value)
          .map(([, data]) => ({ data: () => data })),
      }),
    }),
    orderBy: () => ({
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([, data]) => ({ data: () => data })),
      }),
    }),
  };
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: (name: string) => collectionRef(name),
    batch: () => batchMock(),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
  Timestamp: class {},
}));

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import * as handler from "./users";
import type { AuthenticatedRequest } from "../middleware/auth";
import { effectivePermissions, type Role } from "../auth/permissions";

interface ResMock extends Response {
  __status: number | undefined;
  __body: { success?: boolean; error?: string; data?: unknown } | undefined;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = {};
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: unknown) {
    this.__body = body as ResMock["__body"];
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

/** Construye el req tal y como lo deja `requirePermission`. */
function buildReq(
  actorRole: Role,
  targetUid: string,
  body: unknown,
  actorUid = "actor-1"
): Request {
  const user = {
    uid: actorUid,
    role: actorRole,
    status: "active" as const,
    permissions: effectivePermissions({ role: actorRole }),
    scope: "*",
    email: "",
    displayName: "",
    photoURL: "",
  };
  return {
    params: { uid: targetUid },
    body,
    user,
  } as unknown as AuthenticatedRequest as unknown as Request;
}

function seed(uid: string, data: Record<string, unknown>) {
  docs.set(`users/${uid}`, { uid, ...data });
}

beforeEach(() => {
  docs.clear();
  updates.length = 0;
});

describe("updateRole — validación", () => {
  it("rechaza un rol inexistente", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "t1", { role: "superadmin", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige un motivo", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "t1", { role: "organizer" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toMatch(/reason/i);
  });

  it("rechaza un motivo en blanco", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "t1", { role: "organizer", reason: "   " }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("impide cambiarse el rol a uno mismo", async () => {
    seed("actor-1", { role: "admin" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "actor-1", { role: "member", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toMatch(/your own role/i);
  });

  it("404 si el usuario no existe", async () => {
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "fantasma", { role: "member", reason: "x" }),
      res
    );
    expect(res.__status).toBe(404);
  });

  it("un admin cambia el rol y queda auditado con el motivo", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "t1", {
        role: "organizer",
        reason: "Se suma al equipo",
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(updates).toEqual([
      { path: "users/t1", data: { role: "organizer" } },
    ]);
    expect(auditLogEntries()[0]).toMatchObject({
      action: "user.role.change",
      performedBy: "actor-1",
      targetId: "t1",
      details: {
        newRole: "organizer",
        previousRole: "member",
        reason: "Se suma al equipo",
      },
    });
  });
});

describe("updateRole — no escalada", () => {
  it("un organizador con users:role:write no puede nombrar admin", async () => {
    seed("t1", { role: "member" });
    const req = buildReq("organizer", "t1", { role: "admin", reason: "x" });
    // Se le concede el permiso de gestionar roles, pero no los del rol admin.
    (req as AuthenticatedRequest).user.permissions = new Set([
      ...effectivePermissions({ role: "organizer" }),
      "users:role:write",
    ]);
    const res = buildRes();
    await handler.updateRole(req, res);
    expect(res.__status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("tampoco puede DEGRADAR a un admin", async () => {
    seed("t1", { role: "admin" });
    seed("t2", { role: "admin" });
    const req = buildReq("organizer", "t1", { role: "member", reason: "x" });
    (req as AuthenticatedRequest).user.permissions = new Set([
      ...effectivePermissions({ role: "organizer" }),
      "users:role:write",
    ]);
    const res = buildRes();
    await handler.updateRole(req, res);
    expect(res.__status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("un admin sí puede ambas cosas", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "t1", { role: "admin", reason: "Nueva lead" }),
      res
    );
    expect(res.__body?.success).toBe(true);
  });
});

describe("updateRole — último admin", () => {
  it("no deja degradar al único admin activo", async () => {
    seed("actor-1", { role: "admin" });
    seed("t1", { role: "admin", status: "suspended" });
    // Solo `actor-1` cuenta como admin activo; degradarse a sí mismo ya está
    // bloqueado, así que se prueba degradando al único activo desde otro actor.
    docs.clear();
    seed("solo-admin", { role: "admin" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "solo-admin", { role: "member", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toMatch(/last active admin/i);
    expect(updates).toHaveLength(0);
  });

  it("sí deja degradar cuando queda otro admin activo", async () => {
    seed("admin-a", { role: "admin" });
    seed("admin-b", { role: "admin" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "admin-a", {
        role: "member",
        reason: "Deja el equipo",
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
  });

  it("un admin suspendido no cuenta para el mínimo", async () => {
    seed("admin-a", { role: "admin" });
    seed("admin-b", { role: "admin", status: "suspended" });
    const res = buildRes();
    await handler.updateRole(
      buildReq("admin", "admin-a", { role: "member", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });
});

describe("updateStatus", () => {
  it("suspende y audita", async () => {
    seed("t1", { role: "organizer" });
    const res = buildRes();
    await handler.updateStatus(
      buildReq("admin", "t1", { status: "suspended", reason: "Baja temporal" }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(updates).toEqual([
      { path: "users/t1", data: { status: "suspended" } },
    ]);
    expect(auditLogEntries()[0]).toMatchObject({
      action: "user.status.change",
      details: { newStatus: "suspended", reason: "Baja temporal" },
    });
  });

  it("rechaza un status inventado", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateStatus(
      buildReq("admin", "t1", { status: "vacaciones", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja suspenderse a uno mismo", async () => {
    seed("actor-1", { role: "admin" });
    const res = buildRes();
    await handler.updateStatus(
      buildReq("admin", "actor-1", { status: "suspended", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja suspender al último admin activo", async () => {
    seed("solo-admin", { role: "admin" });
    const res = buildRes();
    await handler.updateStatus(
      buildReq("admin", "solo-admin", { status: "suspended", reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toMatch(/last active admin/i);
  });

  it("exige motivo", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateStatus(
      buildReq("admin", "t1", { status: "suspended" }),
      res
    );
    expect(res.__status).toBe(400);
  });
});

describe("updateGrants", () => {
  it("concede un permiso con alcance y caducidad", async () => {
    seed("t1", { role: "member" });
    const expires = new Date(Date.now() + 86400_000).toISOString();
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "t1", {
        grants: [
          {
            permission: "roster:read",
            scope: "devfest-2026",
            expiresAt: expires,
          },
        ],
        revocations: [],
        reason: "Apoyo puntual en puerta",
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
    const written = updates[0].data.grants as Record<string, unknown>[];
    expect(written[0]).toMatchObject({
      permission: "roster:read",
      scope: "devfest-2026",
      grantedBy: "actor-1",
    });
  });

  it("no deja conceder un permiso que el actor no tiene", async () => {
    seed("t1", { role: "member" });
    // Un organizador al que se le concedió gestionar usuarios: puede repartir
    // lo que posee, pero `audit:read` no está entre sus permisos.
    const req = buildReq("organizer", "t1", {
      grants: [{ permission: "audit:read", scope: "*" }],
      revocations: [],
      reason: "x",
    });
    (req as AuthenticatedRequest).user.permissions = new Set([
      ...effectivePermissions({ role: "organizer" }),
      "users:role:write",
    ]);
    const res = buildRes();
    await handler.updateGrants(req, res);
    expect(res.__status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("sí deja conceder un permiso que el actor sí posee", async () => {
    seed("t1", { role: "member" });
    const req = buildReq("organizer", "t1", {
      grants: [{ permission: "roster:read", scope: "devfest-2026" }],
      revocations: [],
      reason: "Apoyo puntual",
    });
    (req as AuthenticatedRequest).user.permissions = new Set([
      ...effectivePermissions({ role: "organizer" }),
      "users:role:write",
    ]);
    const res = buildRes();
    await handler.updateGrants(req, res);
    expect(res.__body?.success).toBe(true);
  });

  // Un permiso retirado al actor no puede repartirlo: si no, bastaría
  // concedérselo a un tercero para recuperarlo por la puerta de atrás.
  it("una revocación del actor le impide conceder ese permiso", async () => {
    seed("t1", { role: "member" });
    const req = buildReq("admin", "t1", {
      grants: [{ permission: "audit:read", scope: "*" }],
      revocations: [],
      reason: "x",
    });
    (req as AuthenticatedRequest).user.permissions = effectivePermissions({
      role: "admin",
      revocations: ["audit:read"],
    });
    const res = buildRes();
    await handler.updateGrants(req, res);
    expect(res.__status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("rechaza permisos inexistentes", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "t1", {
        grants: [{ permission: "todo:todo", scope: "*" }],
        revocations: [],
        reason: "x",
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechaza una fecha de caducidad inválida", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "t1", {
        grants: [
          { permission: "roster:read", scope: "*", expiresAt: "no-es-fecha" },
        ],
        revocations: [],
        reason: "x",
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige que grants y revocations sean arrays", async () => {
    seed("t1", { role: "member" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "t1", { grants: "nope", revocations: [], reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja cambiarse los permisos a uno mismo", async () => {
    seed("actor-1", { role: "admin" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "actor-1", {
        grants: [],
        revocations: [],
        reason: "x",
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("un organizador no puede tocar los permisos de un admin", async () => {
    seed("t1", { role: "admin" });
    const req = buildReq("organizer", "t1", {
      grants: [],
      revocations: [],
      reason: "x",
    });
    const res = buildRes();
    await handler.updateGrants(req, res);
    expect(res.__status).toBe(403);
  });

  it("acota el número de entradas", async () => {
    seed("t1", { role: "member" });
    const many = Array.from({ length: 51 }, () => ({
      permission: "roster:read",
      scope: "*",
    }));
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "t1", { grants: many, revocations: [], reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });
});

// Degradar o suspender al último admin ya estaba cubierto; vaciarlo por
// revocaciones lo dejaba igual de inútil y no lo impedía nada. Y como
// `countActiveAdmins()` cuenta por rol y estado, seguía contando como admin
// activo mientras no podía hacer nada.
describe("updateGrants — último admin", () => {
  it("no deja revocar la administración de usuarios al único admin", async () => {
    docs.clear();
    seed("solo-admin", { role: "admin" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "solo-admin", {
        grants: [],
        revocations: ["users:role:write"],
        reason: "x",
      }),
      res
    );
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toMatch(/last active admin/i);
    expect(updates).toHaveLength(0);
  });

  it("sí deja hacerlo cuando queda otro admin activo", async () => {
    seed("admin-a", { role: "admin" });
    seed("admin-b", { role: "admin" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "admin-a", {
        grants: [],
        revocations: ["users:role:write"],
        reason: "Se queda solo con lectura",
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
  });

  it("un admin suspendido no cuenta para el mínimo", async () => {
    seed("admin-a", { role: "admin" });
    seed("admin-b", { role: "admin", status: "suspended" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "admin-a", {
        grants: [],
        revocations: ["users:role:write"],
        reason: "x",
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  // La guarda es específica: retirarle otra cosa al último admin no lo deja
  // sin gobierno, así que no hay motivo para impedirlo.
  it("deja revocar un permiso que no sea el de administrar usuarios", async () => {
    docs.clear();
    seed("solo-admin", { role: "admin" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "solo-admin", {
        grants: [],
        revocations: ["events:delete"],
        reason: "Ya no borra eventos",
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
  });

  // Sobre un no-admin la guarda no aplica: el rol no otorga ese permiso, así
  // que revocarlo no quita nada que nadie más pueda cubrir.
  it("no estorba al tocar los permisos de alguien que no es admin", async () => {
    docs.clear();
    seed("solo-admin", { role: "admin" });
    seed("t1", { role: "organizer" });
    const res = buildRes();
    await handler.updateGrants(
      buildReq("admin", "t1", {
        grants: [],
        revocations: ["users:role:write"],
        reason: "x",
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
  });
});
