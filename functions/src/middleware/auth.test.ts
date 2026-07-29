import { Request, Response, NextFunction } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock firebase-admin BEFORE importing the middleware so it captures the
// mock. `verifyIdToken` resolves whatever the current test staged, and
// Firestore is a tiny in-memory store keyed by document path.
const verifyIdToken = vi.fn();
const docs = new Map<string, Record<string, unknown>>();
const readPaths: string[] = [];

function docRef(path: string) {
  return {
    get: async () => {
      readPaths.push(path);
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function collectionRef(path: string) {
  return { doc: (id: string) => docRef(`${path}/${id}`) };
}

vi.mock("firebase-admin", () => ({
  auth: () => ({ verifyIdToken }),
  firestore: () => ({ collection: (name: string) => collectionRef(name) }),
}));

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { requireAuth, requirePermission } from "./auth";
import type { AuthenticatedRequest } from "./auth";

interface ResMock extends Response {
  __status: number | undefined;
  __body: { success?: boolean; error?: string } | undefined;
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

function buildReq(params: Record<string, string> = {}, token = "t"): Request {
  return {
    headers: { authorization: `Bearer ${token}` },
    params,
    path: "/api/test",
  } as unknown as Request;
}

async function run(
  middleware: ReturnType<typeof requirePermission>,
  req: Request
) {
  const res = buildRes();
  const next = vi.fn() as unknown as NextFunction;
  await middleware(req, res, next);
  return {
    res,
    next,
    passed: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0,
  };
}

beforeEach(() => {
  verifyIdToken.mockReset();
  verifyIdToken.mockResolvedValue({ uid: "u1", email: "u@x.com" });
  docs.clear();
  readPaths.length = 0;
});

describe("requirePermission — token", () => {
  it("responde 401 sin cabecera Authorization", async () => {
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    await requirePermission("events:read")(
      { headers: {}, params: {} } as unknown as Request,
      res,
      next
    );
    expect(res.__status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 401 si el token no verifica", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    const { res, passed } = await run(
      requirePermission("events:read"),
      buildReq()
    );
    expect(res.__status).toBe(401);
    expect(passed).toBe(false);
  });

  it("responde 403 si no existe el doc de usuario", async () => {
    const { res, passed } = await run(
      requirePermission("events:read"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(res.__body?.error).toBe("User not registered");
    expect(passed).toBe(false);
  });

  it("responde 403 si el rol es desconocido", async () => {
    docs.set("users/u1", { role: "superadmin" });
    const { res, passed } = await run(
      requirePermission("events:read"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(res.__body?.error).toBe("Invalid user data");
    expect(passed).toBe(false);
  });
});

describe("requirePermission — permisos globales", () => {
  it("deja pasar a un organizador con el permiso", async () => {
    docs.set("users/u1", { role: "organizer" });
    const req = buildReq();
    const { passed } = await run(requirePermission("events:write"), req);
    expect(passed).toBe(true);
    expect((req as AuthenticatedRequest).user.role).toBe("organizer");
    expect(
      (req as AuthenticatedRequest).user.permissions.has("events:write")
    ).toBe(true);
  });

  it("bloquea al organizador en un permiso de admin", async () => {
    docs.set("users/u1", { role: "organizer" });
    const { res, passed } = await run(
      requirePermission("users:role:write"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(res.__body?.error).toBe("Insufficient permissions");
    expect(passed).toBe(false);
  });

  it("bloquea a un member en todo", async () => {
    docs.set("users/u1", { role: "member" });
    const { res, passed } = await run(
      requirePermission("events:read"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(passed).toBe(false);
  });

  it("deja pasar a un admin", async () => {
    docs.set("users/u1", { role: "admin" });
    const { passed } = await run(
      requirePermission("rebuild:trigger"),
      buildReq()
    );
    expect(passed).toBe(true);
  });
});

describe("requirePermission — suspensión", () => {
  it("responde 403 a un admin suspendido", async () => {
    docs.set("users/u1", { role: "admin", status: "suspended" });
    const { res, passed } = await run(
      requirePermission("events:read"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(res.__body?.error).toBe("Account suspended");
    expect(passed).toBe(false);
  });

  it("trata un doc sin status como activo (retrocompatible)", async () => {
    docs.set("users/u1", { role: "admin" });
    const { passed } = await run(requirePermission("events:read"), buildReq());
    expect(passed).toBe(true);
  });
});

describe("requirePermission — grants", () => {
  it("un grant global concede el permiso a un member", async () => {
    docs.set("users/u1", {
      role: "member",
      grants: [{ permission: "events:read", scope: "*" }],
    });
    const { passed } = await run(requirePermission("events:read"), buildReq());
    expect(passed).toBe(true);
  });

  it("un grant vencido no concede el permiso", async () => {
    docs.set("users/u1", {
      role: "member",
      grants: [
        {
          permission: "events:read",
          scope: "*",
          expiresAt: Date.now() - 60_000,
        },
      ],
    });
    const { res, passed } = await run(
      requirePermission("events:read"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(passed).toBe(false);
  });

  it("una revocación retira un permiso del rol", async () => {
    docs.set("users/u1", { role: "admin", revocations: ["rebuild:trigger"] });
    const { res, passed } = await run(
      requirePermission("rebuild:trigger"),
      buildReq()
    );
    expect(res.__status).toBe(403);
    expect(passed).toBe(false);
  });
});

describe("requirePermission — alcance por evento", () => {
  const scoped = () =>
    requirePermission("checkin:operate", { scopeParam: "slug" });

  it("un voluntario asignado al evento pasa", async () => {
    docs.set("users/u1", { role: "volunteer" });
    docs.set("events/devfest-2025/staff/u1", { assignedBy: "admin" });
    const req = buildReq({ slug: "devfest-2025" });
    const { passed } = await run(scoped(), req);
    expect(passed).toBe(true);
    expect((req as AuthenticatedRequest).user.scope).toBe("devfest-2025");
  });

  it("el mismo voluntario NO pasa en otro evento", async () => {
    docs.set("users/u1", { role: "volunteer" });
    docs.set("events/devfest-2025/staff/u1", { assignedBy: "admin" });
    const { res, passed } = await run(
      scoped(),
      buildReq({ slug: "otro-evento" })
    );
    expect(res.__status).toBe(403);
    expect(passed).toBe(false);
  });

  it("una asignación caducada deja de valer", async () => {
    docs.set("users/u1", { role: "volunteer" });
    docs.set("events/devfest-2025/staff/u1", {
      expiresAt: Date.now() - 60_000,
    });
    const { res, passed } = await run(
      scoped(),
      buildReq({ slug: "devfest-2025" })
    );
    expect(res.__status).toBe(403);
    expect(passed).toBe(false);
  });

  it("una asignación vigente sí vale", async () => {
    docs.set("users/u1", { role: "volunteer" });
    docs.set("events/devfest-2025/staff/u1", {
      expiresAt: Date.now() + 3_600_000,
    });
    const { passed } = await run(scoped(), buildReq({ slug: "devfest-2025" }));
    expect(passed).toBe(true);
  });

  it("un voluntario no alcanza permisos fuera de su bundle ni asignado", async () => {
    docs.set("users/u1", { role: "volunteer" });
    docs.set("events/devfest-2025/staff/u1", {});
    const { res, passed } = await run(
      requirePermission("events:write", { scopeParam: "slug" }),
      buildReq({ slug: "devfest-2025" })
    );
    expect(res.__status).toBe(403);
    expect(passed).toBe(false);
  });

  it("no paga la lectura de staff cuando el permiso ya es global", async () => {
    docs.set("users/u1", { role: "organizer" });
    await run(scoped(), buildReq({ slug: "devfest-2025" }));
    expect(readPaths).toEqual(["users/u1"]);
  });

  it("no paga la lectura de staff cuando el rol nunca puede acotarlo", async () => {
    docs.set("users/u1", { role: "member" });
    await run(
      requirePermission("events:write", { scopeParam: "slug" }),
      buildReq({ slug: "devfest-2025" })
    );
    expect(readPaths).toEqual(["users/u1"]);
  });

  // El slug acaba en una ruta de Firestore, y este middleware corre antes que
  // validateParamId en la cadena: se valida por su cuenta en vez de fiarse
  // del orden de los middlewares.
  it("rechaza un alcance con formato inválido", async () => {
    docs.set("users/u1", { role: "volunteer" });
    for (const bad of ["..", ".", "a/b", "a b", "x".repeat(101)]) {
      const { res, passed } = await run(scoped(), buildReq({ slug: bad }));
      expect(res.__status).toBe(400);
      expect(passed).toBe(false);
    }
  });

  it("no toca Firestore con un alcance inválido", async () => {
    docs.set("users/u1", { role: "volunteer" });
    await run(scoped(), buildReq({ slug: ".." }));
    expect(readPaths).toEqual([]);
  });
});

describe("requireAuth", () => {
  it("no inventa un rol", async () => {
    const req = buildReq();
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    await requireAuth()(req, res, next);
    expect(next).toHaveBeenCalled();
    const user = (req as AuthenticatedRequest).user;
    expect(user.role).toBeNull();
    expect(user.permissions.size).toBe(0);
    expect(user.uid).toBe("u1");
  });

  it("responde 401 con token inválido", async () => {
    verifyIdToken.mockRejectedValue(new Error("nope"));
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    await requireAuth()(buildReq(), res, next);
    expect(res.__status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("no lee Firestore", async () => {
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    await requireAuth()(buildReq(), res, next);
    expect(readPaths).toEqual([]);
  });
});
