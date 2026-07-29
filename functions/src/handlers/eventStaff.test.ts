import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
const deleted: string[] = [];
const auditEntries: Record<string, unknown>[] = [];

function docRef(path: string) {
  return {
    id: path.split("/").pop() as string,
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    set: async (data: Record<string, unknown>) => {
      docs.set(path, data);
    },
    delete: async () => {
      deleted.push(path);
      docs.delete(path);
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function collectionRef(name: string) {
  return {
    doc: (id: string) => docRef(`${name}/${id}`),
    get: async () => ({
      docs: [...docs.entries()]
        .filter(([path]) => path.startsWith(`${name}/`))
        .map(([path, data]) => ({
          id: path.split("/").pop() as string,
          data: () => data,
        })),
    }),
  };
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: (name: string) => collectionRef(name),
    collectionGroup: (name: string) => ({
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: [...docs.entries()]
            .filter(([path]) => path.includes(`/${name}/`))
            .filter(([, data]) => data[field] === value)
            .map(([path, data]) => {
              const parts = path.split("/");
              return {
                data: () => data,
                // events/{slug}/staff/{uid} → el abuelo es el doc del evento.
                ref: { parent: { parent: { id: parts[1] } } },
              };
            }),
        }),
      }),
    }),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
  Timestamp: class {},
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: async (entry: Record<string, unknown>) => {
    auditEntries.push(entry);
  },
}));

import * as handler from "./eventStaff";
import type { AuthenticatedRequest } from "../middleware/auth";

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

function buildReq(
  params: Record<string, string>,
  body: unknown = {},
  uid = "adm"
): Request {
  return {
    params,
    body,
    user: { uid, role: "admin", status: "active", scope: "*" },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

const SLUG = "devfest-2026";

beforeEach(() => {
  docs.clear();
  deleted.length = 0;
  auditEntries.length = 0;
});

describe("assignStaff", () => {
  it("asigna a un voluntario y lo audita", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "vol" }, { reason: "Puerta del DevFest" }),
      res
    );
    expect(res.__status).toBe(201);
    expect(docs.get(`events/${SLUG}/staff/vol`)).toMatchObject({
      uid: "vol",
      role: "volunteer",
      assignedBy: "adm",
      reason: "Puerta del DevFest",
    });
    expect(auditEntries[0]).toMatchObject({
      action: "event.staff.assign",
      details: { eventSlug: SLUG },
    });
  });

  it("acepta una caducidad", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const expires = new Date(Date.now() + 86400_000).toISOString();
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "vol" }, { reason: "x", expiresAt: expires }),
      res
    );
    expect(res.__status).toBe(201);
    expect(docs.get(`events/${SLUG}/staff/vol`)?.expiresAt).toBeInstanceOf(
      Date
    );
  });

  it("rechaza una caducidad inválida", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "vol" }, { reason: "x", expiresAt: "ayer?" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige motivo", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(buildReq({ slug: SLUG, uid: "vol" }, {}), res);
    expect(res.__status).toBe(400);
  });

  it("404 si la persona no existe", async () => {
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "fantasma" }, { reason: "x" }),
      res
    );
    expect(res.__status).toBe(404);
  });

  // Asignar a un organizador no le añadiría nada (sus permisos ya son
  // globales) y dejaría un documento que aparenta conceder algo.
  it("rechaza asignar a un rol cuyos permisos no dependen del evento", async () => {
    docs.set("users/org", { uid: "org", role: "organizer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "org" }, { reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(docs.get(`events/${SLUG}/staff/org`)).toBeUndefined();
  });

  it("rechaza asignar a un member", async () => {
    docs.set("users/mem", { uid: "mem", role: "member" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "mem" }, { reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
  });
});

describe("removeStaff", () => {
  it("elimina la asignación y la audita", async () => {
    docs.set(`events/${SLUG}/staff/vol`, { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.removeStaff(buildReq({ slug: SLUG, uid: "vol" }), res);
    expect(res.__body?.success).toBe(true);
    expect(deleted).toContain(`events/${SLUG}/staff/vol`);
    expect(auditEntries[0]).toMatchObject({ action: "event.staff.remove" });
  });

  it("404 si no hay asignación", async () => {
    const res = buildRes();
    await handler.removeStaff(buildReq({ slug: SLUG, uid: "vol" }), res);
    expect(res.__status).toBe(404);
  });
});

describe("listStaff", () => {
  it("marca como inactiva una asignación caducada", async () => {
    docs.set(`events/${SLUG}/staff/viejo`, {
      uid: "viejo",
      expiresAt: new Date(Date.now() - 86400_000),
    });
    docs.set(`events/${SLUG}/staff/vigente`, {
      uid: "vigente",
      expiresAt: null,
    });

    const res = buildRes();
    await handler.listStaff(buildReq({ slug: SLUG }), res);

    const data = res.__body?.data as { uid: string; active: boolean }[];
    expect(data.find((s) => s.uid === "viejo")?.active).toBe(false);
    expect(data.find((s) => s.uid === "vigente")?.active).toBe(true);
  });
});

describe("listMyEvents", () => {
  it("devuelve solo los eventos propios y vigentes", async () => {
    docs.set("events/evento-a/staff/vol", {
      uid: "vol",
      role: "volunteer",
      expiresAt: null,
    });
    docs.set("events/evento-b/staff/vol", {
      uid: "vol",
      role: "volunteer",
      expiresAt: new Date(Date.now() - 1000),
    });
    docs.set("events/evento-c/staff/otra", {
      uid: "otra",
      role: "volunteer",
      expiresAt: null,
    });

    const res = buildRes();
    await handler.listMyEvents(buildReq({}, {}, "vol"), res);

    const data = res.__body?.data as { eventSlug: string }[];
    expect(data.map((e) => e.eventSlug)).toEqual(["evento-a"]);
  });
});
