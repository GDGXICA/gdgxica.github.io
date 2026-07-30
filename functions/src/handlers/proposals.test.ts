import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
const auditEntries: Record<string, unknown>[] = [];
const published: { kind: string; payload: Record<string, unknown> }[] = [];
let existingIds = new Set<string>();

function docRef(path: string) {
  return {
    id: path.split("/").pop() as string,
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    update: async (data: Record<string, unknown>) => {
      docs.set(path, { ...(docs.get(path) ?? {}), ...data });
    },
  };
}

function collectionRef(name: string) {
  const chain = (
    filter: (d: Record<string, unknown>) => boolean = () => true
  ) => ({
    where: (field: string, _op: string, value: unknown) =>
      chain((d) => filter(d) && d[field] === value),
    limit: () => chain(filter),
    get: async () => ({
      docs: [...docs.entries()]
        .filter(([path]) => path.startsWith(`${name}/`))
        .filter(([, data]) => filter(data))
        .map(([path, data]) => ({
          id: path.split("/").pop() as string,
          data: () => data,
        })),
    }),
  });

  return {
    doc: (id: string) => docRef(`${name}/${id}`),
    add: async (data: Record<string, unknown>) => {
      const id = `p-${docs.size + 1}`;
      docs.set(`${name}/${id}`, data);
      return { id };
    },
    ...chain(),
  };
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({ collection: (name: string) => collectionRef(name) }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
  Timestamp: class {},
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: async (entry: Record<string, unknown>) => {
    auditEntries.push(entry);
  },
  triggerRebuildAndLog: () => {},
}));

vi.mock("../config", () => ({
  GITHUB_TOKEN: { value: () => "token" },
}));

vi.mock("../services/github", () => ({
  GitHubService: class {},
}));

vi.mock("../services/publish", () => ({
  eventExists: async (_g: unknown, id: string) => existingIds.has(id),
  speakerExists: async (_g: unknown, id: string) => existingIds.has(id),
  publishEvent: async (_g: unknown, payload: Record<string, unknown>) => {
    published.push({ kind: "event", payload });
  },
  publishSpeaker: async (_g: unknown, payload: Record<string, unknown>) => {
    published.push({ kind: "speaker", payload });
  },
}));

import * as handler from "./proposals";
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

function buildReq(
  role: Role,
  uid: string,
  body: unknown = {},
  params: Record<string, string> = {}
): Request {
  return {
    body,
    params,
    user: {
      uid,
      email: `${uid}@example.com`,
      displayName: uid,
      photoURL: "",
      role,
      status: "active",
      permissions: effectivePermissions({ role }),
      scope: "*",
    },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

/** Evento mínimo que pasa el esquema Zod real. */
const EVENT = {
  id: "charla-compose",
  title: "Charla sobre Compose",
  description: "Una introducción práctica a Jetpack Compose.",
  date: "2026-09-01",
};

beforeEach(() => {
  docs.clear();
  auditEntries.length = 0;
  published.length = 0;
  existingIds = new Set();
});

describe("createProposal", () => {
  it("un colaborador crea una propuesta de evento", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", { type: "event", payload: EVENT }),
      res
    );
    expect(res.__status).toBe(201);
    const stored = [...docs.values()][0];
    expect(stored).toMatchObject({
      type: "event",
      status: "submitted",
      createdBy: "ext",
    });
  });

  it("rechaza un tipo desconocido", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", { type: "sponsor", payload: EVENT }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechaza contenido que no pasa el esquema", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", {
        type: "event",
        payload: { id: "sin-titulo" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  // El contenido lo escribe gente de fuera de la organización y acaba en el
  // sitio público, así que las URLs no pueden ser cualquier cosa.
  it("rechaza una URL con esquema javascript:", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", {
        type: "event",
        payload: { ...EVENT, image_url: "javascript:alert(1)" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  // venue_map_embed se renderiza como src de un iframe en la página pública:
  // un origen ajeno sería un marco controlado por quien propone.
  it("rechaza un mapa embebido de un origen ajeno", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", {
        type: "event",
        payload: { ...EVENT, venue_map_embed: "https://evil.example/maps/x" },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("acepta un mapa embebido legítimo de Google", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", {
        type: "event",
        payload: {
          ...EVENT,
          venue_map_embed: "https://www.google.com/maps/embed?pb=x",
        },
      }),
      res
    );
    expect(res.__status).toBe(201);
  });

  it("rechaza social_links con javascript: en un speaker", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", {
        type: "speaker",
        payload: {
          id: "ana-perez",
          name: "Ana Pérez",
          social_links: { web: "javascript:alert(1)" },
        },
      }),
      res
    );
    expect(res.__status).toBe(400);
  });

  // Sin tope, una cuenta de colaborador llena la cola de revisión gratis.
  it("limita las propuestas abiertas por persona", async () => {
    for (let i = 0; i < 10; i++) {
      docs.set(`proposals/x${i}`, { createdBy: "ext", status: "submitted" });
    }
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", { type: "event", payload: EVENT }),
      res
    );
    expect(res.__status).toBe(429);
  });

  it("las publicadas y rechazadas no cuentan para el tope", async () => {
    for (let i = 0; i < 10; i++) {
      docs.set(`proposals/x${i}`, { createdBy: "ext", status: "published" });
    }
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", { type: "event", payload: EVENT }),
      res
    );
    expect(res.__status).toBe(201);
  });
});

describe("listProposals", () => {
  beforeEach(() => {
    docs.set("proposals/mia", { createdBy: "ext", type: "event" });
    docs.set("proposals/ajena", { createdBy: "otra", type: "event" });
  });

  it("quien propone solo ve las suyas", async () => {
    const res = buildRes();
    await handler.listProposals(buildReq("contributor", "ext"), res);
    const data = res.__body?.data as { id: string }[];
    expect(data.map((p) => p.id)).toEqual(["mia"]);
  });

  it("quien revisa las ve todas", async () => {
    const res = buildRes();
    await handler.listProposals(buildReq("organizer", "org"), res);
    const data = res.__body?.data as { id: string }[];
    expect(data.map((p) => p.id).sort()).toEqual(["ajena", "mia"]);
  });
});

describe("updateProposal", () => {
  it("quien propone corrige tras un 'requiere cambios'", async () => {
    docs.set("proposals/p1", {
      createdBy: "ext",
      type: "event",
      status: "changes_requested",
    });
    const res = buildRes();
    await handler.updateProposal(
      buildReq("contributor", "ext", { payload: EVENT }, { id: "p1" }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(docs.get("proposals/p1")).toMatchObject({ status: "submitted" });
  });

  it("no se puede editar la propuesta de otra persona", async () => {
    docs.set("proposals/p1", {
      createdBy: "otra",
      type: "event",
      status: "draft",
    });
    const res = buildRes();
    await handler.updateProposal(
      buildReq("contributor", "ext", { payload: EVENT }, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(403);
  });

  it("no se puede editar una ya publicada", async () => {
    docs.set("proposals/p1", {
      createdBy: "ext",
      type: "event",
      status: "published",
    });
    const res = buildRes();
    await handler.updateProposal(
      buildReq("contributor", "ext", { payload: EVENT }, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(409);
  });
});

describe("reviewProposal", () => {
  beforeEach(() => {
    docs.set("proposals/p1", {
      createdBy: "ext",
      type: "event",
      payload: EVENT,
      status: "submitted",
    });
  });

  it("aprueba sin exigir comentario", async () => {
    const res = buildRes();
    await handler.reviewProposal(
      buildReq("organizer", "org", { decision: "approved" }, { id: "p1" }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(docs.get("proposals/p1")).toMatchObject({ status: "approved" });
  });

  it("pedir cambios exige comentario", async () => {
    const res = buildRes();
    await handler.reviewProposal(
      buildReq(
        "organizer",
        "org",
        { decision: "changes_requested" },
        { id: "p1" }
      ),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechazar exige comentario", async () => {
    const res = buildRes();
    await handler.reviewProposal(
      buildReq("organizer", "org", { decision: "rejected" }, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("rechaza una decisión inventada", async () => {
    const res = buildRes();
    await handler.reviewProposal(
      buildReq("organizer", "org", { decision: "quizas" }, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(400);
  });

  it("no se revisa la propia propuesta", async () => {
    const res = buildRes();
    await handler.reviewProposal(
      buildReq("organizer", "ext", { decision: "approved" }, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(400);
  });
});

describe("publishProposal", () => {
  function seedApproved(over: Record<string, unknown> = {}) {
    docs.set("proposals/p1", {
      createdBy: "ext",
      type: "event",
      payload: EVENT,
      status: "approved",
      ...over,
    });
  }

  it("publica y audita bajo la identidad de quien publica", async () => {
    seedApproved();
    const res = buildRes();
    await handler.publishProposal(
      buildReq("organizer", "org", {}, { id: "p1" }),
      res
    );
    expect(res.__body?.success).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0].kind).toBe("event");
    expect(docs.get("proposals/p1")).toMatchObject({
      status: "published",
      publishedBy: "org",
    });
    // El autor queda registrado, pero quien responde por la publicación es
    // quien la ejecutó.
    expect(auditEntries[0]).toMatchObject({
      action: "proposal.publish",
      performedBy: "org",
      details: { proposedBy: "ext" },
    });
  });

  it("solo publica una propuesta aprobada", async () => {
    seedApproved({ status: "submitted" });
    const res = buildRes();
    await handler.publishProposal(
      buildReq("organizer", "org", {}, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(409);
    expect(published).toHaveLength(0);
  });

  // Un id repetido sobrescribiría un evento real ya publicado.
  it("no pisa contenido existente con el mismo id", async () => {
    seedApproved();
    existingIds.add(EVENT.id);
    const res = buildRes();
    await handler.publishProposal(
      buildReq("organizer", "org", {}, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(409);
    expect(published).toHaveLength(0);
  });

  // El esquema puede haber cambiado entre el envío y la publicación.
  it("revalida el contenido al publicar", async () => {
    seedApproved({ payload: { id: "roto" } });
    const res = buildRes();
    await handler.publishProposal(
      buildReq("organizer", "org", {}, { id: "p1" }),
      res
    );
    expect(res.__status).toBe(422);
    expect(published).toHaveLength(0);
  });

  it("404 si no existe", async () => {
    const res = buildRes();
    await handler.publishProposal(
      buildReq("organizer", "org", {}, { id: "fantasma" }),
      res
    );
    expect(res.__status).toBe(404);
  });
});

/**
 * Toda la superficie de escritura de un `contributor` pasa por crear y editar
 * propuestas, y era invisible hasta que alguien revisaba: solo se auditaban la
 * revisión y la publicación. Un colaborador externo es el perfil con menos
 * confianza acumulada, así que es el que más falta hace poder reconstruir.
 */
describe("auditoría de crear y editar", () => {
  it("audita la creación", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", { type: "event", payload: EVENT }),
      res
    );
    expect(res.__status).toBe(201);
    expect(auditEntries[0]).toMatchObject({
      action: "proposal.create",
      targetType: "proposal",
      details: { type: "event" },
    });
  });

  // El payload puede ser grande y ya está en el propio documento; duplicarlo en
  // los detalles solo engordaría el registro.
  it("no mete el payload en los detalles", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", { type: "event", payload: EVENT }),
      res
    );
    expect(auditEntries[0].details).not.toHaveProperty("payload");
  });

  it("no audita una creación rechazada por validación", async () => {
    const res = buildRes();
    await handler.createProposal(
      buildReq("contributor", "ext", {
        type: "event",
        payload: { id: "sin-titulo" },
      }),
      res
    );
    expect(res.__status).toBe(400);
    expect(auditEntries).toHaveLength(0);
  });
});
