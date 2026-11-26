import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
const deleted: string[] = [];

/**
 * Entradas realmente escritas en `audit_log`. Se leen del almacén en vez de
 * mockear `../utils/audit` para que el test compruebe que la asignación de
 * staff y su registro se confirman en el mismo batch: asignar staff concede
 * permisos dentro del evento, así que una asignación sin rastro es el mismo
 * problema que un cambio de rol sin rastro.
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

type DocRef = ReturnType<typeof docRef>;

/** Nada toca el almacén hasta `commit()`: eso es lo que se está probando. */
function batchMock() {
  const staged: (() => void)[] = [];
  const api = {
    set: (ref: DocRef, data: Record<string, unknown>) => {
      staged.push(() => docs.set(ref.__path, data));
      return api;
    },
    update: (ref: DocRef, data: Record<string, unknown>) => {
      staged.push(() =>
        docs.set(ref.__path, { ...(docs.get(ref.__path) ?? {}), ...data })
      );
      return api;
    },
    delete: (ref: DocRef) => {
      staged.push(() => {
        deleted.push(ref.__path);
        docs.delete(ref.__path);
      });
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
    doc: (id?: string) => docRef(`${name}/${id ?? `gen-${++generatedIds}`}`),
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
    batch: () => batchMock(),
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

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import * as handler from "./eventStaff";
import type { AuthenticatedRequest } from "../middleware/auth";
import { PERMISSIONS } from "../auth/permissions";

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
  uid = "adm",
  permissions: Iterable<string> = PERMISSIONS
): Request {
  return {
    params,
    body,
    user: {
      uid,
      role: "admin",
      status: "active",
      scope: "*",
      permissions: new Set(permissions),
    },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

const CHECKIN = { capabilities: ["checkin"] };

const SLUG = "devfest-2026";

beforeEach(() => {
  docs.clear();
  deleted.length = 0;
});

describe("assignStaff", () => {
  it("asigna a un voluntario y lo audita", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq(
        { slug: SLUG, uid: "vol" },
        { ...CHECKIN, reason: "Puerta del DevFest" }
      ),
      res
    );
    expect(res.__status).toBe(201);
    expect(docs.get(`events/${SLUG}/staff/vol`)).toMatchObject({
      uid: "vol",
      role: "volunteer",
      assignedBy: "adm",
      reason: "Puerta del DevFest",
      // The capability expands to what it needs: marking without reading
      // the roster would leave the screen empty.
      permissions: ["checkin:operate", "roster:read"],
    });
    expect(auditLogEntries()[0]).toMatchObject({
      action: "event.staff.assign",
      details: {
        eventSlug: SLUG,
        capabilities: ["checkin"],
        permissions: ["checkin:operate", "roster:read"],
      },
    });
    expect(auditLogEntries()[0].details).not.toHaveProperty(
      "previousPermissions"
    );
  });

  it("acepta una caducidad", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const expires = new Date(Date.now() + 86400_000).toISOString();
    const res = buildRes();
    await handler.assignStaff(
      buildReq(
        { slug: SLUG, uid: "vol" },
        { ...CHECKIN, reason: "x", expiresAt: expires }
      ),
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
      buildReq(
        { slug: SLUG, uid: "vol" },
        { ...CHECKIN, reason: "x", expiresAt: "ayer?" }
      ),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige motivo", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "vol" }, CHECKIN),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("exige al menos una capacidad conocida", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    for (const capabilities of [[], ["todo"], undefined]) {
      const res = buildRes();
      await handler.assignStaff(
        buildReq({ slug: SLUG, uid: "vol" }, { capabilities, reason: "x" }),
        res
      );
      expect(res.__status).toBe(400);
    }
    expect(docs.get(`events/${SLUG}/staff/vol`)).toBeUndefined();
  });

  it("al editar guarda lo nuevo y deja constancia de lo anterior", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    docs.set(`events/${SLUG}/staff/vol`, { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq(
        { slug: SLUG, uid: "vol" },
        { capabilities: ["mural", "minigames"], reason: "Solo dinámicas" }
      ),
      res
    );
    expect(res.__status).toBe(201);
    expect(docs.get(`events/${SLUG}/staff/vol`)?.permissions).toEqual([
      "minigames:operate",
      "mural:moderate",
    ]);
    expect(auditLogEntries()[0]).toMatchObject({
      details: {
        capabilities: ["minigames", "mural"],
        // The old assignment had no list: it granted the whole bundle.
        previousPermissions: null,
      },
    });
  });

  // No escalada: solo se reparte lo que uno tiene.
  it("no deja conceder lo que quien asigna no tiene", async () => {
    docs.set("users/vol", { uid: "vol", role: "volunteer" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq(
        { slug: SLUG, uid: "vol" },
        { capabilities: ["credentials"], reason: "x" },
        "adm",
        ["users:role:write", "roster:read", "checkin:operate"]
      ),
      res
    );
    expect(res.__status).toBe(403);
    expect(docs.get(`events/${SLUG}/staff/vol`)).toBeUndefined();
  });

  it("404 si la persona no existe", async () => {
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "fantasma" }, { ...CHECKIN, reason: "x" }),
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
      buildReq({ slug: SLUG, uid: "org" }, { ...CHECKIN, reason: "x" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(docs.get(`events/${SLUG}/staff/org`)).toBeUndefined();
  });

  it("rechaza asignar a un member", async () => {
    docs.set("users/mem", { uid: "mem", role: "member" });
    const res = buildRes();
    await handler.assignStaff(
      buildReq({ slug: SLUG, uid: "mem" }, { ...CHECKIN, reason: "x" }),
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
    expect(auditLogEntries()[0]).toMatchObject({
      action: "event.staff.remove",
    });
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

  it("devuelve las capacidades de cada asignación", async () => {
    docs.set(`events/${SLUG}/staff/a`, {
      uid: "a",
      permissions: ["checkin:operate", "roster:read"],
    });
    docs.set(`events/${SLUG}/staff/b`, { uid: "b" });

    const res = buildRes();
    await handler.listStaff(buildReq({ slug: SLUG }), res);

    const data = res.__body?.data as { uid: string; capabilities: string[] }[];
    expect(data.find((s) => s.uid === "a")?.capabilities).toEqual(["checkin"]);
    expect(data.find((s) => s.uid === "b")?.capabilities).toEqual([
      "checkin",
      "minigames",
      "mural",
      "credentials",
    ]);
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

  // The panel shows each volunteer only the tools of each assignment.
  it("dice qué puede hacer en cada evento", async () => {
    docs.set("events/evento-a/staff/vol", {
      uid: "vol",
      role: "volunteer",
      permissions: ["mural:moderate"],
    });
    docs.set("events/evento-b/staff/vol", { uid: "vol", role: "volunteer" });

    const res = buildRes();
    await handler.listMyEvents(buildReq({}, {}, "vol"), res);

    const data = res.__body?.data as {
      eventSlug: string;
      permissions: string[] | null;
    }[];
    expect(data.find((e) => e.eventSlug === "evento-a")?.permissions).toEqual([
      "mural:moderate",
    ]);
    // No list: the whole role bundle, as before capabilities existed.
    expect(
      data.find((e) => e.eventSlug === "evento-b")?.permissions
    ).toBeNull();
  });
});
