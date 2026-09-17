import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
const versions = new Map<string, number>();
const auditEntries: Record<string, unknown>[] = [];
const calls: string[] = [];
const savedObjects: string[] = [];
let deleteShouldFail = false;
let auditShouldFail = false;

function applyValues(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && "__increment" in value) {
      const prev = typeof out[key] === "number" ? (out[key] as number) : 0;
      out[key] = prev + (value as { __increment: number }).__increment;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function bump(path: string) {
  versions.set(path, (versions.get(path) ?? 0) + 1);
}

function writeDoc(
  path: string,
  data: Record<string, unknown>,
  op: "set" | "update",
  merge?: boolean
) {
  calls.push(`firestore.${op}:${path}`);
  const base = op === "update" || merge ? (docs.get(path) ?? {}) : {};
  docs.set(path, applyValues(base, data));
  bump(path);
}

function docRef(path: string) {
  return {
    id: path.split("/").pop() as string,
    path,
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    update: async (data: Record<string, unknown>) => {
      writeDoc(path, data, "update");
    },
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      writeDoc(path, data, "set", opts?.merge);
    },
  };
}

type Ref = ReturnType<typeof docRef>;

async function runTransaction<T>(
  fn: (tx: {
    get: (ref: Ref) => Promise<{ exists: boolean; data: () => unknown }>;
    set: (ref: Ref, data: Record<string, unknown>, opts?: unknown) => void;
    update: (ref: Ref, data: Record<string, unknown>) => void;
  }) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const read = new Map<string, number>();
    const pending: Array<() => void> = [];
    const tx = {
      get: async (ref: Ref) => {
        read.set(ref.path, versions.get(ref.path) ?? 0);
        return ref.get();
      },
      set: (ref: Ref, data: Record<string, unknown>, opts?: unknown) => {
        const merge = (opts as { merge?: boolean } | undefined)?.merge;
        pending.push(() => writeDoc(ref.path, data, "set", merge));
      },
      update: (ref: Ref, data: Record<string, unknown>) => {
        pending.push(() => writeDoc(ref.path, data, "update"));
      },
    };

    const result = await fn(tx);

    const conflicted = [...read].some(
      ([path, seen]) => (versions.get(path) ?? 0) !== seen
    );
    if (conflicted) continue;

    for (const write of pending) write();
    return result;
  }
  throw new Error("transaction retries exhausted");
}

function collectionRef(base: string) {
  const chain = (filter: (d: Record<string, unknown>) => boolean) => ({
    where: (field: string, _op: string, value: unknown) =>
      chain((d) => filter(d) && d[field] === value),
    limit: () => chain(filter),
    get: async () => ({
      docs: [...docs.entries()]
        .filter(([path]) => path.startsWith(`${base}/`))
        .filter(([, data]) => filter(data))
        .map(([path, data]) => ({
          id: path.split("/").pop() as string,
          ref: docRef(path),
          data: () => data,
        })),
    }),
  });
  return chain(() => true);
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    doc: (path: string) => docRef(path),
    collection: (path: string) => collectionRef(path),
    runTransaction,
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__TS__",
    increment: (n: number) => ({ __increment: n }),
  },
}));

vi.mock("firebase-functions", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: async (entry: Record<string, unknown>) => {
    if (auditShouldFail) throw new Error("audit down");
    auditEntries.push(entry);
  },
}));

vi.mock("../services/muralStorage", () => ({
  muralObjectPath: (slug: string, id: string) => `mural/${slug}/${id}.jpg`,
  saveMuralPhoto: async (slug: string, id: string) => {
    const path = `mural/${slug}/${id}.jpg`;
    calls.push(`storage.save:${path}`);
    savedObjects.push(path);
    return {
      path,
      url: `https://firebasestorage.googleapis.com/…/${id}?token=t`,
    };
  },
  deleteMuralPhoto: async (path: string) => {
    calls.push(`storage.delete:${path}`);
    if (deleteShouldFail) throw new Error("storage down");
    const at = savedObjects.indexOf(path);
    if (at !== -1) savedObjects.splice(at, 1);
  },
}));

import * as handler from "./mural";

const SLUG = "devfest-ica-2026";
const AUTHOR = "anon-ana";
const MODERATOR = "org-1";
const SETTINGS = `events/${SLUG}/muralMeta/settings`;
const UPLOADER = `events/${SLUG}/muralUploaders/${AUTHOR}`;

function jpegDataUrl(bytes = 64): string {
  const buf = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(Math.max(0, bytes - 4)),
  ]);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

interface ResMock extends Response {
  __status: number | undefined;
  __body: Record<string, unknown> | undefined;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = { __status: undefined, __body: undefined };
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: Record<string, unknown>) {
    this.__body = body;
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

function buildReq(
  params: Record<string, string>,
  body: unknown,
  uid = AUTHOR
): Request {
  return { params, body, user: { uid } } as unknown as Request;
}

function uploadBody(over: Record<string, unknown> = {}) {
  return {
    dataUrl: jpegDataUrl(),
    alias: "Ana",
    width: 1600,
    height: 1200,
    consent: true as const,
    clientRequestId: "req-00000001",
    ...over,
  };
}

function openMural(over: Record<string, unknown> = {}) {
  docs.set(SETTINGS, {
    state: "open",
    maxPerUid: 10,
    maxTotal: 1500,
    acceptedTotal: 0,
    ...over,
  });
}

function seedPhoto(id: string, over: Record<string, unknown> = {}) {
  docs.set(`events/${SLUG}/muralPhotos/${id}`, {
    eventSlug: SLUG,
    status: "pending",
    uid: AUTHOR,
    alias: "Ana",
    storagePath: `mural/${SLUG}/${id}.jpg`,
    downloadUrl: "https://firebasestorage.googleapis.com/…",
    approvedAt: null,
    removalRequestedAt: null,
    ...over,
  });
  savedObjects.push(`mural/${SLUG}/${id}.jpg`);
}

function photo(id: string) {
  return docs.get(`events/${SLUG}/muralPhotos/${id}`) ?? {};
}

beforeEach(() => {
  docs.clear();
  versions.clear();
  auditEntries.length = 0;
  calls.length = 0;
  savedObjects.length = 0;
  deleteShouldFail = false;
  auditShouldFail = false;
});

describe("uploadPhoto", () => {
  it("acepta una foto y la deja PENDIENTE, nunca visible de entrada", async () => {
    openMural();
    const res = buildRes();
    await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);

    expect(res.__status).toBe(201);
    const id = (res.__body?.data as { id: string }).id;
    expect(photo(id).status).toBe("pending");
    expect(photo(id).approvedAt).toBeNull();
  });

  it("escribe todos los campos, incluidos los que valen null", async () => {
    openMural();
    const res = buildRes();
    await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);

    const stored = photo((res.__body?.data as { id: string }).id);
    for (const field of [
      "eventSlug",
      "status",
      "uid",
      "alias",
      "storagePath",
      "downloadUrl",
      "width",
      "height",
      "bytes",
      "contentType",
      "createdAt",
      "approvedAt",
      "reviewedAt",
      "reviewedBy",
      "reviewNote",
      "removalRequestedAt",
      "removalRequestNote",
      "removedReason",
      "clientRequestId",
    ]) {
      expect(Object.keys(stored)).toContain(field);
    }
  });

  it("cuenta la subida en la cuota del uid y en el total del evento", async () => {
    openMural();
    await handler.uploadPhoto(
      buildReq({ slug: SLUG }, uploadBody()),
      buildRes()
    );

    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(1);
    expect(docs.get(UPLOADER)?.uploadedCount).toBe(1);
  });

  describe("techos", () => {
    it("rechaza si el mural no está abierto", async () => {
      openMural({ state: "closed" });
      const res = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
      expect(res.__status).toBe(409);
      expect(res.__body?.code).toBe("mural_closed");
    });

    it("rechaza si está pausado", async () => {
      openMural({ state: "paused" });
      const res = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
      expect(res.__status).toBe(409);
    });

    it("rechaza si no hay documento de ajustes", async () => {
      const res = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
      expect(res.__status).toBe(409);
      expect(res.__body?.code).toBe("mural_closed");
    });

    it("rechaza la que pasa de la cuota por persona", async () => {
      openMural({ maxPerUid: 2 });
      docs.set(UPLOADER, { uploadedCount: 2 });
      const res = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
      expect(res.__status).toBe(409);
      expect(res.__body?.code).toBe("quota_uid");
      expect(res.__body?.error).toContain("2 fotos");
    });

    it("rechaza cuando el evento llega a su techo total", async () => {
      openMural({ maxTotal: 5, acceptedTotal: 5 });
      const res = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
      expect(res.__status).toBe(409);
      expect(res.__body?.code).toBe("mural_full");
    });

    it("a quien está bloqueado le responde lo MISMO que si estuviera cerrado", async () => {
      openMural();
      docs.set(UPLOADER, { uploadedCount: 0, blocked: true });
      const blocked = buildRes();
      await handler.uploadPhoto(
        buildReq({ slug: SLUG }, uploadBody()),
        blocked
      );

      docs.delete(UPLOADER);
      openMural({ state: "closed" });
      const closed = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), closed);

      expect(blocked.__status).toBe(closed.__status);
      expect(blocked.__body?.code).toBe(closed.__body?.code);
      expect(blocked.__body?.error).toBe(closed.__body?.error);
    });

    it("usa 409 para las cuotas, nunca 429", async () => {
      openMural({ maxPerUid: 1 });
      docs.set(UPLOADER, { uploadedCount: 1 });
      const res = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
      expect(res.__status).not.toBe(429);
      expect(res.__status).toBe(409);
    });

    it("no deja bytes en el bucket cuando rechaza por cuota", async () => {
      openMural({ maxPerUid: 1 });
      docs.set(UPLOADER, { uploadedCount: 1 });
      await handler.uploadPhoto(
        buildReq({ slug: SLUG }, uploadBody()),
        buildRes()
      );
      expect(savedObjects).toEqual([]);
    });
  });

  it("con dos subidas simultáneas en el último hueco, pasa exactamente una", async () => {
    openMural({ maxTotal: 1, acceptedTotal: 0, maxPerUid: 10 });

    const resA = buildRes();
    const resB = buildRes();
    await Promise.all([
      handler.uploadPhoto(
        buildReq(
          { slug: SLUG },
          uploadBody({ clientRequestId: "req-A0000001" })
        ),
        resA
      ),
      handler.uploadPhoto(
        buildReq(
          { slug: SLUG },
          uploadBody({ clientRequestId: "req-B0000001" })
        ),
        resB
      ),
    ]);

    const statuses = [resA.__status, resB.__status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(1);

    expect(savedObjects).toHaveLength(1);
  });

  describe("idempotencia", () => {
    it("un reintento con el mismo clientRequestId no duplica ni gasta cuota", async () => {
      openMural();
      const body = uploadBody({ clientRequestId: "req-mismo-01" });

      const first = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, body), first);
      const second = buildRes();
      await handler.uploadPhoto(buildReq({ slug: SLUG }, body), second);

      expect(first.__status).toBe(201);
      expect(second.__status).toBe(200);
      expect((second.__body?.data as { id: string }).id).toBe(
        (first.__body?.data as { id: string }).id
      );
      expect(docs.get(SETTINGS)?.acceptedTotal).toBe(1);
      expect(docs.get(UPLOADER)?.uploadedCount).toBe(1);
    });

    it("un clientRequestId distinto sí cuenta como foto nueva", async () => {
      openMural();
      await handler.uploadPhoto(
        buildReq(
          { slug: SLUG },
          uploadBody({ clientRequestId: "req-0000001a" })
        ),
        buildRes()
      );
      await handler.uploadPhoto(
        buildReq(
          { slug: SLUG },
          uploadBody({ clientRequestId: "req-0000001b" })
        ),
        buildRes()
      );
      expect(docs.get(SETTINGS)?.acceptedTotal).toBe(2);
    });
  });

  describe("validación de la imagen", () => {
    it("rechaza bytes que no son un JPEG aunque se anuncien como tal", async () => {
      openMural();
      const html = Buffer.from("<script>alert(1)</script>").toString("base64");
      const res = buildRes();
      await handler.uploadPhoto(
        buildReq(
          { slug: SLUG },
          uploadBody({ dataUrl: `data:image/jpeg;base64,${html}` })
        ),
        res
      );
      expect(res.__status).toBe(400);
      expect(savedObjects).toEqual([]);
    });

    it("rechaza un PNG: el cliente siempre recodifica a JPEG", async () => {
      openMural();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString(
        "base64"
      );
      const res = buildRes();
      await handler.uploadPhoto(
        buildReq(
          { slug: SLUG },
          uploadBody({ dataUrl: `data:image/jpeg;base64,${png}` })
        ),
        res
      );
      expect(res.__status).toBe(400);
    });

    it("rechaza una foto por encima del tope de bytes", async () => {
      openMural();
      const res = buildRes();
      await handler.uploadPhoto(
        buildReq({ slug: SLUG }, uploadBody({ dataUrl: jpegDataUrl(400_000) })),
        res
      );
      expect(res.__status).toBe(400);
    });

    it("rechaza un alias impublicable", async () => {
      openMural();
      const res = buildRes();
      await handler.uploadPhoto(
        buildReq({ slug: SLUG }, uploadBody({ alias: "puta" })),
        res
      );
      expect(res.__status).toBe(400);
      expect(savedObjects).toEqual([]);
    });

    it("acepta sin alias: subir no obliga a ponerse nombre", async () => {
      openMural();
      const res = buildRes();
      await handler.uploadPhoto(
        buildReq({ slug: SLUG }, uploadBody({ alias: "" })),
        res
      );
      expect(res.__status).toBe(201);
    });
  });

  it("audita la subida sin meter los bytes en los detalles", async () => {
    openMural();
    await handler.uploadPhoto(
      buildReq({ slug: SLUG }, uploadBody()),
      buildRes()
    );

    const entry = auditEntries.find((e) => e.action === "mural.photo.upload");
    expect(entry).toBeDefined();
    expect(entry?.targetType).toBe("mural_photo");
    expect(JSON.stringify(entry)).not.toContain("data:image");
  });
});

describe("reviewPhoto", () => {
  it("aprobar sella approvedAt y NO toca los bytes", async () => {
    seedPhoto("p1");
    const res = buildRes();
    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { decision: "approve", note: "" },
        MODERATOR
      ),
      res
    );

    expect(res.__status).toBeUndefined();
    expect(photo("p1").status).toBe("approved");
    expect(photo("p1").approvedAt).toBe("__TS__");
    expect(savedObjects).toContain(`mural/${SLUG}/p1.jpg`);
  });

  it("rechazar borra el objeto ANTES de flipear el estado", async () => {
    seedPhoto("p1");
    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { decision: "reject", note: "sale un menor" },
        MODERATOR
      ),
      buildRes()
    );

    const deleted = calls.indexOf(`storage.delete:mural/${SLUG}/p1.jpg`);
    const updated = calls.indexOf(
      `firestore.update:events/${SLUG}/muralPhotos/p1`
    );
    expect(deleted).toBeGreaterThanOrEqual(0);
    expect(deleted).toBeLessThan(updated);
    expect(photo("p1").status).toBe("rejected");
    expect(photo("p1").downloadUrl).toBeNull();
    expect(savedObjects).toEqual([]);
  });

  it("si el borrado falla de verdad, NO flipea el estado y responde 500", async () => {
    seedPhoto("p1");
    deleteShouldFail = true;
    const res = buildRes();
    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { decision: "reject", note: "no" },
        MODERATOR
      ),
      res
    );

    expect(res.__status).toBe(500);
    expect(photo("p1").status).toBe("pending");
    expect(photo("p1").downloadUrl).not.toBeNull();
  });

  it("404 si la foto no existe", async () => {
    const res = buildRes();
    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: "nope" },
        { decision: "approve", note: "" },
        MODERATOR
      ),
      res
    );
    expect(res.__status).toBe(404);
  });

  it("409 si ya no está pendiente", async () => {
    seedPhoto("p1", { status: "approved" });
    const res = buildRes();
    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { decision: "approve", note: "" },
        MODERATOR
      ),
      res
    );
    expect(res.__status).toBe(409);
  });

  it("atribuye la decisión a quien la tomó", async () => {
    seedPhoto("p1");
    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { decision: "approve", note: "" },
        MODERATOR
      ),
      buildRes()
    );
    expect(photo("p1").reviewedBy).toBe(MODERATOR);
    const entry = auditEntries.find((e) => e.action === "mural.photo.review");
    expect(entry?.performedBy).toBe(MODERATOR);
  });
});

describe("takedownPhoto", () => {
  it("retira una aprobada, borrando los bytes antes de flipear", async () => {
    seedPhoto("p1", { status: "approved" });
    await handler.takedownPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { reason: "owner_request", note: "lo pidió Ana" },
        MODERATOR
      ),
      buildRes()
    );

    const deleted = calls.indexOf(`storage.delete:mural/${SLUG}/p1.jpg`);
    const updated = calls.indexOf(
      `firestore.update:events/${SLUG}/muralPhotos/p1`
    );
    expect(deleted).toBeLessThan(updated);
    expect(photo("p1").status).toBe("removed");
    expect(photo("p1").removedReason).toBe("owner_request");
    expect(photo("p1").storagePath).toBeNull();
    expect(savedObjects).toEqual([]);
  });

  it("no borra el documento, solo los bytes", async () => {
    seedPhoto("p1", { status: "approved" });
    await handler.takedownPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { reason: "moderation", note: "x" },
        MODERATOR
      ),
      buildRes()
    );
    expect(docs.has(`events/${SLUG}/muralPhotos/p1`)).toBe(true);
  });

  it("409 sobre una que no está aprobada", async () => {
    seedPhoto("p1", { status: "pending" });
    const res = buildRes();
    await handler.takedownPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { reason: "moderation", note: "x" },
        MODERATOR
      ),
      res
    );
    expect(res.__status).toBe(409);
  });

  it("una retirada ya retirada no se puede repetir", async () => {
    seedPhoto("p1", { status: "removed" });
    const res = buildRes();
    await handler.takedownPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { reason: "other", note: "x" },
        MODERATOR
      ),
      res
    );
    expect(res.__status).toBe(409);
  });

  it("si el borrado falla, la foto sigue aprobada y se puede reintentar", async () => {
    seedPhoto("p1", { status: "approved" });
    deleteShouldFail = true;
    const res = buildRes();
    await handler.takedownPhoto(
      buildReq(
        { slug: SLUG, id: "p1" },
        { reason: "owner_request", note: "x" },
        MODERATOR
      ),
      res
    );
    expect(res.__status).toBe(500);
    expect(photo("p1").status).toBe("approved");
  });
});

describe("requestRemoval", () => {
  it("marca la petición y la deja visible para el panel", async () => {
    seedPhoto("p1", { status: "approved" });
    const res = buildRes();
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "p1" }, { note: "salgo yo, quítala" }, AUTHOR),
      res
    );

    expect(res.__status).toBeUndefined();
    expect(photo("p1").removalRequestedAt).toBe("__TS__");
    expect(photo("p1").removalRequestNote).toBe("salgo yo, quítala");

    expect(photo("p1").status).toBe("approved");
  });

  it("funciona también sobre una que todavía está pendiente", async () => {
    seedPhoto("p1", { status: "pending" });
    const res = buildRes();
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "p1" }, { note: "" }, AUTHOR),
      res
    );
    expect(photo("p1").removalRequestedAt).toBe("__TS__");
  });

  it("403 si la foto no es de quien la pide", async () => {
    seedPhoto("p1", { status: "approved" });
    const res = buildRes();
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "p1" }, { note: "" }, "anon-otro"),
      res
    );
    expect(res.__status).toBe(403);
    expect(photo("p1").removalRequestedAt).toBeNull();
  });

  it("es idempotente: pedirlo otra vez responde éxito, no conflicto", async () => {
    seedPhoto("p1", { status: "approved", removalRequestedAt: "__TS__" });
    const res = buildRes();
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "p1" }, { note: "" }, AUTHOR),
      res
    );
    expect(res.__status).toBe(200);
    expect(res.__body?.success).toBe(true);
  });

  it("sobre una ya retirada responde que ya no está, sin error", async () => {
    seedPhoto("p1", { status: "removed" });
    const res = buildRes();
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "p1" }, { note: "" }, AUTHOR),
      res
    );
    expect(res.__status).toBe(200);
    expect((res.__body?.data as { alreadyGone: boolean }).alreadyGone).toBe(
      true
    );
  });

  it("404 si la foto no existe", async () => {
    const res = buildRes();
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "nope" }, { note: "" }, AUTHOR),
      res
    );
    expect(res.__status).toBe(404);
  });

  it("deja fila de auditoría atribuida a quien subió", async () => {
    seedPhoto("p1", { status: "approved" });
    await handler.requestRemoval(
      buildReq({ slug: SLUG, id: "p1" }, { note: "quítala" }, AUTHOR),
      buildRes()
    );
    const entry = auditEntries.find(
      (e) => e.action === "mural.photo.removal_request"
    );
    expect(entry?.performedBy).toBe(AUTHOR);
  });
});

describe("setSettings", () => {
  const body = {
    state: "open" as const,
    maxPerUid: 10,
    maxTotal: 1500,
    headline: "Sube tus fotos",
  };

  it("escribe los ajustes y los audita", async () => {
    const res = buildRes();
    await handler.setSettings(buildReq({ slug: SLUG }, body, MODERATOR), res);

    expect(docs.get(SETTINGS)?.state).toBe("open");
    expect(docs.get(SETTINGS)?.maxTotal).toBe(1500);
    expect(auditEntries.some((e) => e.action === "mural.settings.update")).toBe(
      true
    );
  });

  it("NO reinicia acceptedTotal al guardar", async () => {
    openMural({ acceptedTotal: 742 });
    await handler.setSettings(
      buildReq({ slug: SLUG }, body, MODERATOR),
      buildRes()
    );
    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(742);
  });
});

describe("blockUploader", () => {
  it("bloquea y desbloquea, dejando constancia de quién", async () => {
    const res = buildRes();
    await handler.blockUploader(
      buildReq(
        { slug: SLUG, uid: AUTHOR },
        { blocked: true, note: "inundó la cola" },
        MODERATOR
      ),
      res
    );
    expect(docs.get(UPLOADER)?.blocked).toBe(true);
    expect(docs.get(UPLOADER)?.blockedBy).toBe(MODERATOR);

    await handler.blockUploader(
      buildReq(
        { slug: SLUG, uid: AUTHOR },
        { blocked: false, note: "" },
        MODERATOR
      ),
      buildRes()
    );
    expect(docs.get(UPLOADER)?.blocked).toBe(false);
  });

  it("no toca el contador de subidas", async () => {
    docs.set(UPLOADER, { uid: AUTHOR, uploadedCount: 7 });
    await handler.blockUploader(
      buildReq(
        { slug: SLUG, uid: AUTHOR },
        { blocked: true, note: "x" },
        MODERATOR
      ),
      buildRes()
    );
    expect(docs.get(UPLOADER)?.uploadedCount).toBe(7);
  });
});

describe("idempotencia real", () => {
  it("guarda constancia del consentimiento", async () => {
    openMural();
    const res = buildRes();
    await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);
    const stored = photo((res.__body?.data as { id: string }).id);
    expect(stored.consentAt).toBe("__TS__");
  });

  it("dos envios concurrentes con el MISMO id dejan una sola foto", async () => {
    openMural();
    const body = uploadBody({ clientRequestId: "req-iguales" });

    const resA = buildRes();
    const resB = buildRes();
    await Promise.all([
      handler.uploadPhoto(buildReq({ slug: SLUG }, body), resA),
      handler.uploadPhoto(buildReq({ slug: SLUG }, body), resB),
    ]);

    const statuses = [resA.__status ?? 200, resB.__status ?? 200].sort();
    expect(statuses).toEqual([200, 201]);
    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(1);
    expect(docs.get(UPLOADER)?.uploadedCount).toBe(1);
    expect(new Set(savedObjects).size).toBe(1);
    expect(calls.filter((c) => c.startsWith("storage.delete"))).toEqual([]);
  });

  it("reenviar una foto ya RECHAZADA la sube como nueva, no como duplicado", async () => {
    openMural();
    const body = uploadBody({ clientRequestId: "req-reenvio" });

    const first = buildRes();
    await handler.uploadPhoto(buildReq({ slug: SLUG }, body), first);
    const firstId = (first.__body?.data as { id: string }).id;

    await handler.reviewPhoto(
      buildReq(
        { slug: SLUG, id: firstId },
        { decision: "reject", note: "no" },
        MODERATOR
      ),
      buildRes()
    );

    const second = buildRes();
    await handler.uploadPhoto(buildReq({ slug: SLUG }, body), second);

    expect(second.__status).toBe(201);
    const secondId = (second.__body?.data as { id: string }).id;
    expect(secondId).not.toBe(firstId);
    expect(photo(secondId).status).toBe("pending");
    expect(photo(firstId).status).toBe("rejected");
  });

  it("un fallo POSTERIOR al commit no borra los bytes de una foto ya viva", async () => {
    openMural();
    auditShouldFail = true;
    const res = buildRes();
    await handler.uploadPhoto(buildReq({ slug: SLUG }, uploadBody()), res);

    expect(res.__status).toBe(500);
    expect(savedObjects).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("storage.delete"))).toEqual([]);
  });
});

describe("bloquear devuelve plazas", () => {
  function block(blocked: boolean) {
    return handler.blockUploader(
      buildReq(
        { slug: SLUG, uid: AUTHOR },
        { blocked, note: "inundo la cola" },
        MODERATOR
      ),
      buildRes()
    );
  }

  it("devuelve al evento las plazas de lo no publicado y tumba lo pendiente", async () => {
    openMural({ acceptedTotal: 5 });
    seedPhoto("p1");
    seedPhoto("p2");
    seedPhoto("r1", { status: "rejected", storagePath: null });

    await block(true);

    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(2);
    expect(photo("p1").status).toBe("rejected");
    expect(photo("p2").status).toBe("rejected");
    expect(photo("p1").downloadUrl).toBeNull();
    expect(savedObjects).not.toContain(`mural/${SLUG}/p1.jpg`);
    expect(savedObjects).not.toContain(`mural/${SLUG}/p2.jpg`);
  });

  it("no toca las aprobadas: esas plazas se gastaron de verdad", async () => {
    openMural({ acceptedTotal: 3 });
    seedPhoto("ok", { status: "approved" });
    seedPhoto("p1");

    await block(true);

    expect(photo("ok").status).toBe("approved");
    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(2);
  });

  it("es idempotente: bloquear dos veces no descuenta dos veces", async () => {
    openMural({ acceptedTotal: 5 });
    seedPhoto("p1");

    await block(true);
    const afterFirst = docs.get(SETTINGS)?.acceptedTotal;
    await block(false);
    await block(true);

    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(afterFirst);
  });

  it("nunca deja el contador del evento en negativo", async () => {
    openMural({ acceptedTotal: 1 });
    seedPhoto("p1");
    seedPhoto("p2");
    seedPhoto("p3");

    await block(true);

    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(0);
  });

  it("desbloquear no devuelve plazas", async () => {
    openMural({ acceptedTotal: 4 });
    seedPhoto("p1");

    await block(false);

    expect(docs.get(SETTINGS)?.acceptedTotal).toBe(4);
    expect(photo("p1").status).toBe("pending");
  });
});
