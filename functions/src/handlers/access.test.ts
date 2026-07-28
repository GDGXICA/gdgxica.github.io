import { Request, Response } from "express";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
const updates: { path: string; data: Record<string, unknown> }[] = [];
const auditEntries: Record<string, unknown>[] = [];
const sentInvitations: Record<string, unknown>[] = [];
const sentDecisions: Record<string, unknown>[] = [];
let invitationEmailFails = false;

function snapFor(path: string) {
  const data = docs.get(path);
  return {
    id: path.split("/").pop() as string,
    ref: docRef(path),
    exists: data !== undefined,
    data: () => data,
  };
}

function docRef(path: string) {
  return {
    id: path.split("/").pop() as string,
    get: async () => snapFor(path),
    set: async (data: Record<string, unknown>) => {
      docs.set(path, data);
    },
    update: async (data: Record<string, unknown>) => {
      updates.push({ path, data });
      docs.set(path, { ...(docs.get(path) ?? {}), ...data });
    },
  };
}

function docsUnder(name: string) {
  return [...docs.entries()].filter(([path]) => path.startsWith(`${name}/`));
}

function collectionRef(name: string) {
  const chain = (
    filter: (data: Record<string, unknown>) => boolean = () => true
  ) => ({
    where: (field: string, _op: string, value: unknown) =>
      chain((d) => filter(d) && d[field] === value),
    orderBy: () => chain(filter),
    limit: () => chain(filter),
    get: async () => ({
      docs: docsUnder(name)
        .filter(([, data]) => filter(data))
        .map(([path]) => snapFor(path)),
    }),
  });

  return {
    doc: (id: string) => docRef(`${name}/${id}`),
    add: async (data: Record<string, unknown>) => {
      const id = `gen-${docsUnder(name).length + 1}`;
      docs.set(`${name}/${id}`, data);
      return { id };
    },
    ...chain(),
  };
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: (name: string) => collectionRef(name),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        update: (
          ref: { update: (d: Record<string, unknown>) => Promise<void> },
          d: Record<string, unknown>
        ) => void;
      }) => Promise<void>
    ) => {
      await fn({
        get: async (ref) => ref.get(),
        update: (ref, d) => {
          void ref.update(d);
        },
      });
    },
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
  Timestamp: class {},
}));

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: async (entry: Record<string, unknown>) => {
    auditEntries.push(entry);
  },
}));

vi.mock("../services/email", () => ({
  sendInvitationEmail: async (mail: Record<string, unknown>) => {
    if (invitationEmailFails) throw new Error("smtp down");
    sentInvitations.push(mail);
  },
  sendAccessDecisionEmail: async (mail: Record<string, unknown>) => {
    sentDecisions.push(mail);
  },
}));

import * as handler from "./access";
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

function buildReq(opts: {
  role?: Role | null;
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}): Request {
  const role = opts.role ?? null;
  return {
    body: opts.body ?? {},
    params: opts.params ?? {},
    query: opts.query ?? {},
    user: {
      uid: opts.uid ?? "u1",
      email: opts.email ?? "persona@example.com",
      emailVerified: opts.emailVerified ?? true,
      displayName: "Persona",
      photoURL: "",
      role,
      status: "active",
      permissions: role ? effectivePermissions({ role }) : new Set(),
      scope: "*",
    },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

beforeEach(() => {
  docs.clear();
  updates.length = 0;
  auditEntries.length = 0;
  sentInvitations.length = 0;
  sentDecisions.length = 0;
  invitationEmailFails = false;
});

describe("createRequest", () => {
  it("crea una solicitud pendiente", async () => {
    const res = buildRes();
    await handler.createRequest(
      buildReq({
        body: {
          requestedRole: "contributor",
          motivo: "Quiero proponer charlas",
        },
      }),
      res
    );
    expect(res.__status).toBe(201);
    expect(docs.get("access_requests/u1")).toMatchObject({
      status: "pending",
      requestedRole: "contributor",
      motivo: "Quiero proponer charlas",
    });
  });

  it("no deja pedir admin", async () => {
    const res = buildRes();
    await handler.createRequest(
      buildReq({ body: { requestedRole: "admin", motivo: "dame todo" } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja pedir member (no aporta nada)", async () => {
    const res = buildRes();
    await handler.createRequest(
      buildReq({ body: { requestedRole: "member", motivo: "hola" } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige motivo", async () => {
    const res = buildRes();
    await handler.createRequest(
      buildReq({ body: { requestedRole: "volunteer" } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no permite reabrir una solicitud ya aprobada", async () => {
    docs.set("access_requests/u1", { status: "approved" });
    const res = buildRes();
    await handler.createRequest(
      buildReq({ body: { requestedRole: "organizer", motivo: "otra vez" } }),
      res
    );
    expect(res.__status).toBe(409);
  });

  it("permite reintentar tras un rechazo", async () => {
    docs.set("access_requests/u1", { status: "rejected" });
    const res = buildRes();
    await handler.createRequest(
      buildReq({ body: { requestedRole: "volunteer", motivo: "ahora ayudo" } }),
      res
    );
    expect(res.__status).toBe(201);
  });

  // El /join de minijuegos crea sesiones anónimas sin coste; sin esta puerta
  // llenarían la cola de solicitudes con documentos sin correo al que avisar.
  it("rechaza una sesión sin correo verificado", async () => {
    const res = buildRes();
    await handler.createRequest(
      buildReq({
        emailVerified: false,
        body: { requestedRole: "contributor", motivo: "hola" },
      }),
      res
    );
    expect(res.__status).toBe(403);
    expect(docs.get("access_requests/u1")).toBeUndefined();
  });

  it("rechaza una sesión anónima (sin correo)", async () => {
    const res = buildRes();
    await handler.createRequest(
      buildReq({
        email: "",
        body: { requestedRole: "contributor", motivo: "hola" },
      }),
      res
    );
    expect(res.__status).toBe(403);
  });
});

describe("decideRequest", () => {
  beforeEach(() => {
    docs.set("access_requests/t1", {
      uid: "t1",
      email: "t1@example.com",
      requestedRole: "volunteer",
      status: "pending",
    });
    docs.set("users/t1", { uid: "t1", role: "member" });
  });

  it("aprueba y aplica el rol", async () => {
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "admin",
        uid: "rev",
        params: { uid: "t1" },
        body: { approve: true, note: "Apoya en el DevFest" },
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(docs.get("users/t1")).toMatchObject({ role: "volunteer" });
    expect(docs.get("access_requests/t1")).toMatchObject({
      status: "approved",
      reviewedBy: "rev",
    });
    expect(auditEntries[0]).toMatchObject({ action: "access.request.approve" });
    expect(sentDecisions[0]).toMatchObject({ approved: true });
  });

  it("rechaza sin tocar el rol", async () => {
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "admin",
        uid: "rev",
        params: { uid: "t1" },
        body: { approve: false, note: "Por ahora no" },
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(docs.get("users/t1")).toMatchObject({ role: "member" });
    expect(sentDecisions[0]).toMatchObject({ approved: false });
  });

  it("exige nota", async () => {
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "admin",
        uid: "rev",
        params: { uid: "t1" },
        body: { approve: true },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja revisar la propia solicitud", async () => {
    docs.set("access_requests/rev", {
      status: "pending",
      requestedRole: "organizer",
    });
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "admin",
        uid: "rev",
        params: { uid: "rev" },
        body: { approve: true, note: "me apruebo" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja decidir dos veces", async () => {
    docs.set("access_requests/t1", {
      status: "approved",
      requestedRole: "volunteer",
    });
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "admin",
        uid: "rev",
        params: { uid: "t1" },
        body: { approve: true, note: "otra vez" },
      }),
      res
    );
    expect(res.__status).toBe(409);
  });

  // `volunteer` no contiene los permisos de `organizer`, así que aunque le
  // hayan concedido `access:review` no puede aprobar a uno.
  it("un voluntario no puede aprobar a un organizador (no escalada)", async () => {
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "volunteer",
        uid: "vol",
        params: { uid: "t1" },
        body: { approve: true, role: "organizer", note: "se suma" },
      }),
      res
    );
    expect(res.__status).toBe(403);
    expect(docs.get("users/t1")).toMatchObject({ role: "member" });
  });

  // El caso principal del encargo: un organizador da de alta a alguien de
  // fuera de la organización.
  it("un organizador sí puede aprobar a un colaborador externo", async () => {
    const res = buildRes();
    await handler.decideRequest(
      buildReq({
        role: "organizer",
        uid: "org",
        params: { uid: "t1" },
        body: { approve: true, role: "contributor", note: "Propone charlas" },
      }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(docs.get("users/t1")).toMatchObject({ role: "contributor" });
  });
});

describe("createInvitation", () => {
  it("crea la invitación guardando solo el hash del token", async () => {
    const res = buildRes();
    await handler.createInvitation(
      buildReq({
        role: "admin",
        uid: "adm",
        body: { email: "Nueva@Example.com", role: "contributor" },
      }),
      res
    );
    expect(res.__status).toBe(201);

    const stored = docs.get("invitations/gen-1") as Record<string, unknown>;
    expect(stored.emailLower).toBe("nueva@example.com");
    expect(typeof stored.tokenHash).toBe("string");
    // El token en claro no se guarda en ninguna parte.
    expect(JSON.stringify(stored)).not.toContain(
      String(sentInvitations[0].url).split("token=")[1]
    );
  });

  it("el enlace apunta al origen canónico, no a lo que diga la petición", async () => {
    const res = buildRes();
    await handler.createInvitation(
      buildReq({
        role: "admin",
        uid: "adm",
        body: { email: "a@example.com", role: "volunteer" },
      }),
      res
    );
    expect(String(sentInvitations[0].url)).toMatch(/^https:\/\/gdgica\.com\//);
  });

  it("rechaza emails inválidos", async () => {
    const res = buildRes();
    await handler.createInvitation(
      buildReq({
        role: "admin",
        uid: "adm",
        body: { email: "no-es-un-email", role: "volunteer" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no deja invitar a admin", async () => {
    const res = buildRes();
    await handler.createInvitation(
      buildReq({
        role: "admin",
        uid: "adm",
        body: { email: "a@example.com", role: "admin" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("un voluntario no puede invitar a organizador (no escalada)", async () => {
    const res = buildRes();
    await handler.createInvitation(
      buildReq({
        role: "volunteer",
        uid: "vol",
        body: { email: "a@example.com", role: "organizer" },
      }),
      res
    );
    expect(res.__status).toBe(403);
    expect(sentInvitations).toHaveLength(0);
  });

  it("avisa con 502 si el correo no sale, para poder reenviar", async () => {
    invitationEmailFails = true;
    const res = buildRes();
    await handler.createInvitation(
      buildReq({
        role: "admin",
        uid: "adm",
        body: { email: "a@example.com", role: "volunteer" },
      }),
      res
    );
    expect(res.__status).toBe(502);
  });
});

describe("redeemInvitation", () => {
  const TOKEN = "un-token-de-prueba";

  function seedInvitation(over: Record<string, unknown> = {}) {
    docs.set("invitations/inv-1", {
      emailLower: "invitada@example.com",
      role: "contributor",
      tokenHash: hash(TOKEN),
      expiresAt: new Date(Date.now() + 86400_000),
      usedAt: null,
      revokedAt: null,
      ...over,
    });
    docs.set("users/u1", { uid: "u1", role: "member" });
  }

  it("canjea y aplica el rol", async () => {
    seedInvitation();
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(docs.get("users/u1")).toMatchObject({ role: "contributor" });
    expect(docs.get("invitations/inv-1")).toMatchObject({ usedBy: "u1" });
  });

  // Sin esta comprobación cualquiera con el enlace reenviado se lleva el rol.
  it("RECHAZA a quien no es la persona invitada", async () => {
    seedInvitation();
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "otra@example.com", body: { token: TOKEN } }),
      res
    );
    expect(res.__status).toBe(400);
    // El rol se queda como estaba y la invitación sigue sin usarse.
    expect(docs.get("users/u1")).toMatchObject({ role: "member" });
    expect(docs.get("invitations/inv-1")).toMatchObject({ usedAt: null });
  });

  it("rechaza un token que no coincide", async () => {
    seedInvitation();
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({
        email: "invitada@example.com",
        body: { token: "token-equivocado" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechaza una invitación caducada", async () => {
    seedInvitation({ expiresAt: new Date(Date.now() - 1000) });
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechaza una ya usada", async () => {
    seedInvitation({ usedAt: "ayer" });
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechaza una revocada", async () => {
    seedInvitation({ revokedAt: "ayer" });
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no distingue el motivo del fallo, para no servir de oráculo", async () => {
    seedInvitation({ revokedAt: "ayer" });
    const revoked = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      revoked
    );

    docs.clear();
    const missing = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      missing
    );

    expect(revoked.__body?.error).toBe(missing.__body?.error);
  });

  it("una invitación a un rol no permitido no se canjea", async () => {
    seedInvitation({ role: "admin" });
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: { token: TOKEN } }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige token", async () => {
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({ email: "invitada@example.com", body: {} }),
      res
    );
    expect(res.__status).toBe(400);
  });

  // El canje se decide comparando correos. Con uno sin verificar, bastaría
  // registrarse escribiendo la dirección de la persona invitada para quedarse
  // con su rol.
  it("RECHAZA un correo sin verificar aunque coincida", async () => {
    seedInvitation();
    const res = buildRes();
    await handler.redeemInvitation(
      buildReq({
        email: "invitada@example.com",
        emailVerified: false,
        body: { token: TOKEN },
      }),
      res
    );
    expect(res.__status).toBe(403);
    expect(docs.get("users/u1")).toMatchObject({ role: "member" });
    expect(docs.get("invitations/inv-1")).toMatchObject({ usedAt: null });
  });
});

describe("listInvitations", () => {
  it("nunca devuelve el tokenHash", async () => {
    docs.set("invitations/inv-1", {
      emailLower: "a@example.com",
      role: "volunteer",
      tokenHash: "no-debe-salir",
    });
    const res = buildRes();
    await handler.listInvitations(buildReq({ role: "admin" }), res);
    expect(JSON.stringify(res.__body?.data)).not.toContain("no-debe-salir");
    expect(JSON.stringify(res.__body?.data)).not.toContain("tokenHash");
  });
});
