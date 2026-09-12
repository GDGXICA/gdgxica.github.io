import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El fake de GitHub es un repo de datos en memoria, y los tests van contra el
 * handler SIN mockear `services/publish`: lo que hay que poder afirmar es que
 * el fichero del post y su índice acaban coherentes, y eso vive justo en la
 * costura entre los dos módulos.
 */
const files = new Map<string, string>();
const auditEntries: Record<string, unknown>[] = [];
const uploads: { path: string; contentType: string; bytes: number }[] = [];
let rebuilds = 0;

vi.mock("firebase-admin", () => ({
  storage: () => ({
    bucket: () => ({
      name: "appgdgica.appspot.com",
      file: (path: string) => ({
        save: async (body: Buffer, options: { contentType: string }) => {
          uploads.push({
            path,
            contentType: options.contentType,
            bytes: body.length,
          });
        },
      }),
    }),
  }),
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: async (entry: Record<string, unknown>) => {
    auditEntries.push(entry);
  },
  triggerRebuildAndLog: () => {
    rebuilds += 1;
  },
}));

vi.mock("../config", () => ({
  GITHUB_TOKEN: { value: () => "token" },
}));

vi.mock("../services/github", () => ({
  GitHubService: class {
    async getFileContent<T>(path: string): Promise<{ data: T; sha: string }> {
      const content = files.get(path);
      // Igual que la de verdad: un fichero ausente LANZA (la API de GitHub
      // responde 404), que es lo que los helpers tienen que tolerar.
      if (content === undefined) throw new Error(`404 ${path}`);
      return { data: JSON.parse(content) as T, sha: `sha-${path}` };
    }
    async putFile(path: string, content: string) {
      files.set(path, content);
    }
    async deleteFile(path: string) {
      files.delete(path);
    }
  },
}));

import * as handler from "./posts";
import type { AuthenticatedRequest } from "../middleware/auth";
import type { PostIndexEntry } from "../services/publish";

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
  body: unknown = {},
  params: Record<string, string> = {}
): Request {
  return {
    body,
    params,
    user: {
      uid: "u-organizer",
      email: "org@gdgica.com",
      displayName: "Ana Organizadora",
      photoURL: "https://lh3.googleusercontent.com/ana",
      role: "organizer",
      status: "active",
      permissions: new Set(["posts:read", "posts:write"]),
      scope: "*",
    },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

/** Post mínimo, ya con los defaults que pondría el esquema Zod. */
const POST = {
  id: "hola-foro",
  title: "Hola, foro",
  excerpt: "El primer post.",
  cover_image_url: "",
  tags: ["comunidad"],
  author_name: "",
  author_photo_url: "",
  published_at: "",
  status: "published" as const,
  body: "# Hola\n\nEste es el primer post del foro.",
};

function index(): PostIndexEntry[] {
  return JSON.parse(files.get("posts/index.json") ?? "[]");
}

function stored(id: string): Record<string, unknown> {
  return JSON.parse(files.get(`posts/${id}.json`) ?? "null");
}

beforeEach(() => {
  files.clear();
  auditEntries.length = 0;
  uploads.length = 0;
  rebuilds = 0;
});

describe("createPost", () => {
  it("escribe el post y crea el índice cuando todavía no existe", async () => {
    const res = buildRes();
    await handler.createPost(buildReq({ ...POST }), res);

    expect(res.__status).toBe(201);
    expect(stored("hola-foro").title).toBe("Hola, foro");
    expect(index()).toHaveLength(1);
    expect(index()[0].id).toBe("hola-foro");
  });

  it("deja el cuerpo fuera del índice", async () => {
    await handler.createPost(buildReq({ ...POST }), buildRes());
    expect(index()[0]).not.toHaveProperty("body");
    expect(stored("hola-foro").body).toContain("primer post");
  });

  // La autoría sale del token verificado: si viniera del cuerpo, cualquiera
  // con posts:write podría firmar con el nombre de otra persona.
  it("estampa autor y fechas desde la sesión", async () => {
    await handler.createPost(buildReq({ ...POST }), buildRes());
    const post = stored("hola-foro");
    expect(post.author_name).toBe("Ana Organizadora");
    expect(post.author_photo_url).toContain("googleusercontent");
    expect(Date.parse(post.published_at as string)).not.toBeNaN();
    expect(Date.parse(post.updated_at as string)).not.toBeNaN();
  });

  it("respeta una fecha de publicación indicada a mano", async () => {
    const when = "2026-01-15T10:00:00.000Z";
    await handler.createPost(
      buildReq({ ...POST, published_at: when }),
      buildRes()
    );
    expect(stored("hola-foro").published_at).toBe(when);
  });

  it("no pisa un post existente", async () => {
    await handler.createPost(buildReq({ ...POST }), buildRes());
    const res = buildRes();
    await handler.createPost(
      buildReq({ ...POST, title: "Otro contenido" }),
      res
    );

    expect(res.__status).toBe(409);
    expect(stored("hola-foro").title).toBe("Hola, foro");
  });

  // Reconstruir el sitio por un borrador que el sitio no enseña solo gasta
  // cuota de Actions.
  it("no reconstruye el sitio al guardar un borrador", async () => {
    await handler.createPost(
      buildReq({ ...POST, status: "draft" }),
      buildRes()
    );
    expect(rebuilds).toBe(0);

    await handler.createPost(
      buildReq({ ...POST, id: "otro", status: "published" }),
      buildRes()
    );
    expect(rebuilds).toBe(1);
  });

  it("deja fila de auditoría", async () => {
    await handler.createPost(buildReq({ ...POST }), buildRes());
    expect(auditEntries[0]).toMatchObject({
      action: "post.create",
      targetId: "hola-foro",
      targetType: "post",
    });
  });
});

describe("updatePost", () => {
  beforeEach(async () => {
    await handler.createPost(buildReq({ ...POST }), buildRes());
    rebuilds = 0;
    auditEntries.length = 0;
  });

  it("actualiza el fichero y la entrada del índice, sin duplicarla", async () => {
    const res = buildRes();
    await handler.updatePost(
      buildReq({ ...POST, title: "Hola de nuevo" }, { id: "hola-foro" }),
      res
    );

    expect(res.__status).toBeUndefined();
    expect(stored("hola-foro").title).toBe("Hola de nuevo");
    expect(index()).toHaveLength(1);
    expect(index()[0].title).toBe("Hola de nuevo");
  });

  // Renombrar el id desde el cuerpo dejaría el post viejo huérfano en el
  // índice y escribiría uno nuevo sin que nadie lo pidiera.
  it("manda el id de la ruta, no el del cuerpo", async () => {
    await handler.updatePost(
      buildReq({ ...POST, id: "otro-id" }, { id: "hola-foro" }),
      buildRes()
    );

    expect(stored("hola-foro")).not.toBeNull();
    expect(files.has("posts/otro-id.json")).toBe(false);
    expect(index().map((e) => e.id)).toEqual(["hola-foro"]);
  });

  it("404 si el post no existe", async () => {
    const res = buildRes();
    await handler.updatePost(buildReq({ ...POST }, { id: "fantasma" }), res);
    expect(res.__status).toBe(404);
  });

  // Despublicar tiene que reconstruir: el sitio sigue enseñándolo hasta que
  // se reconstruye.
  it("reconstruye también al pasar de publicado a borrador", async () => {
    await handler.updatePost(
      buildReq({ ...POST, status: "draft" }, { id: "hola-foro" }),
      buildRes()
    );
    expect(rebuilds).toBe(1);
  });

  it("no reconstruye al editar un borrador que sigue siendo borrador", async () => {
    await handler.updatePost(
      buildReq({ ...POST, status: "draft" }, { id: "hola-foro" }),
      buildRes()
    );
    rebuilds = 0;

    await handler.updatePost(
      buildReq(
        { ...POST, status: "draft", title: "sigo" },
        { id: "hola-foro" }
      ),
      buildRes()
    );
    expect(rebuilds).toBe(0);
  });
});

describe("deletePost", () => {
  it("borra el fichero y su entrada del índice", async () => {
    await handler.createPost(buildReq({ ...POST }), buildRes());
    await handler.createPost(buildReq({ ...POST, id: "segundo" }), buildRes());

    const res = buildRes();
    await handler.deletePost(buildReq({}, { id: "hola-foro" }), res);

    expect(res.__body?.success).toBe(true);
    expect(files.has("posts/hola-foro.json")).toBe(false);
    expect(index().map((e) => e.id)).toEqual(["segundo"]);
  });

  it("404 si el post no existe", async () => {
    const res = buildRes();
    await handler.deletePost(buildReq({}, { id: "fantasma" }), res);
    expect(res.__status).toBe(404);
  });
});

describe("uploadPostImage", () => {
  const PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  function dataUrl(mime: string, bytes: Buffer) {
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }

  it("sube la imagen y devuelve una URL de descarga", async () => {
    const res = buildRes();
    await handler.uploadPostImage(
      buildReq({ dataUrl: dataUrl("image/png", PNG) }),
      res
    );

    expect(res.__status).toBe(201);
    const data = res.__body?.data as { url: string; path: string };
    expect(data.path).toMatch(/^posts\/images\/[0-9a-f-]{36}\.png$/);
    expect(data.url).toContain("firebasestorage.googleapis.com");
    expect(data.url).toContain("token=");
    expect(uploads[0].contentType).toBe("image/png");
  });

  // El prefijo MIME lo escribe quien sube; los bytes son la carga de verdad.
  it("ignora el MIME declarado y guarda según los bytes", async () => {
    await handler.uploadPostImage(
      buildReq({ dataUrl: dataUrl("image/jpeg", PNG) }),
      buildRes()
    );
    expect(uploads[0].contentType).toBe("image/png");
  });

  it("rechaza algo que no es una imagen", async () => {
    const res = buildRes();
    await handler.uploadPostImage(
      buildReq({
        dataUrl: dataUrl("image/png", Buffer.from("<html>hola</html>")),
      }),
      res
    );

    expect(res.__status).toBe(400);
    expect(uploads).toHaveLength(0);
  });

  it("rechaza una imagen por encima del tope", async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(500 * 1024)]);
    const res = buildRes();
    await handler.uploadPostImage(
      buildReq({ dataUrl: dataUrl("image/png", huge) }),
      res
    );

    expect(res.__status).toBe(400);
    expect(uploads).toHaveLength(0);
  });

  it("deja fila de auditoría", async () => {
    await handler.uploadPostImage(
      buildReq({ dataUrl: dataUrl("image/png", PNG) }),
      buildRes()
    );
    expect(auditEntries[0]).toMatchObject({
      action: "post.image.upload",
      targetType: "post_image",
    });
  });
});
