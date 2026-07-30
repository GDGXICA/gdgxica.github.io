import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
let generatedIds = 0;

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions", () => ({ logger: loggerMock }));

function docRef(path: string) {
  return {
    __path: path,
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    update: async (data: Record<string, unknown>) => {
      docs.set(path, { ...(docs.get(path) ?? {}), ...data });
    },
  };
}

type DocRef = ReturnType<typeof docRef>;

/** Nada toca el almacén hasta `commit()`. */
function batchMock() {
  const ops: (() => void)[] = [];
  const api = {
    set: (ref: DocRef, data: Record<string, unknown>) => {
      ops.push(() => docs.set(ref.__path, data));
      return api;
    },
    update: (ref: DocRef, data: Record<string, unknown>) => {
      ops.push(() =>
        docs.set(ref.__path, { ...(docs.get(ref.__path) ?? {}), ...data })
      );
      return api;
    },
    commit: async () => {
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
    }),
    batch: () => batchMock(),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
}));

import { register } from "./auth";

function auditLogEntries(): Record<string, unknown>[] {
  return [...docs.entries()]
    .filter(([path]) => path.startsWith("audit_log/"))
    .map(([, data]) => data);
}

interface ResMock extends Response {
  __status: number | undefined;
  __body: { success?: boolean; data?: unknown } | undefined;
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

function buildReq(uid = "nuevo"): Request {
  return {
    user: {
      uid,
      email: "persona@example.com",
      displayName: "Persona",
      photoURL: "",
      role: null,
      scope: "*",
    },
  } as unknown as Request;
}

beforeEach(() => {
  docs.clear();
  generatedIds = 0;
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
});

describe("register", () => {
  it("crea la cuenta como member y lo audita", async () => {
    const res = buildRes();
    await register(buildReq(), res);

    expect(res.__status).toBe(201);
    expect(docs.get("users/nuevo")).toMatchObject({
      uid: "nuevo",
      role: "member",
      status: "active",
    });
    expect(auditLogEntries()[0]).toMatchObject({
      action: "user.register",
      performedBy: "nuevo",
      targetId: "nuevo",
      targetType: "user",
      category: "access",
      details: { role: "member" },
    });
  });

  // La rama de login actualiza `lastLoginAt` en CADA entrada. Auditar eso daría
  // una fila por inicio de sesión y ahogaría el registro en ruido; el alta
  // ocurre una vez y es lo que interesa poder fechar.
  it("NO audita el login de una cuenta que ya existe", async () => {
    docs.set("users/existente", {
      uid: "existente",
      role: "organizer",
      status: "active",
    });

    const res = buildRes();
    await register(buildReq("existente"), res);

    expect(res.__body?.success).toBe(true);
    expect(auditLogEntries()).toHaveLength(0);
    // Pero sí refresca la marca de último acceso.
    expect(docs.get("users/existente")).toMatchObject({
      lastLoginAt: "__TS__",
    });
  });

  it("cinco logins seguidos no dejan ninguna fila", async () => {
    docs.set("users/existente", { uid: "existente", role: "member" });
    for (let i = 0; i < 5; i++) {
      await register(buildReq("existente"), buildRes());
    }
    expect(auditLogEntries()).toHaveLength(0);
  });

  // El alta no puede conceder permisos por el simple hecho de haber entrado con
  // Google: subir de `member` exige una solicitud aprobada o una invitación.
  it("el alta nunca concede permisos ni grants", async () => {
    await register(buildReq(), buildRes());
    expect(docs.get("users/nuevo")).toMatchObject({
      role: "member",
      grants: [],
      revocations: [],
    });
  });

  // La cuenta y su registro se confirman en el mismo batch: un alta sin rastro
  // dejaría sin fechar la entrada de alguien al sistema.
  it("la cuenta y su registro caen juntos", async () => {
    await register(buildReq(), buildRes());
    expect(docs.get("users/nuevo")).toBeDefined();
    expect(auditLogEntries()).toHaveLength(1);
  });
});
