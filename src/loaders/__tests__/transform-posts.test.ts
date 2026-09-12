import { beforeEach, describe, expect, it, vi } from "vitest";

// Solo se sustituye `fetchGdgData`. `stripDomain`, `formatSpanishDate` y el
// guardián de markdown siguen siendo los de verdad, así que esto ejercita el
// loader entero y no una copia vaciada.
const mocks = vi.hoisted(() => ({ fetchGdgData: vi.fn() }));

vi.mock("../fetch-gdg-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fetch-gdg-data")>();
  return { ...actual, fetchGdgData: mocks.fetchGdgData };
});

import { deriveExcerpt, postsLoader, readingMinutes } from "../transform-posts";
import { GdgDataError } from "../fetch-gdg-data";

/** Lo que lanza el repo de datos cuando el fichero NO está. */
const notFound = (path: string) =>
  new GdgDataError(`Failed to fetch ${path}: 404`, true, 404);

/** Lo que lanza cuando no se pudo leer: red, 5xx, cuota del CDN. */
const unreachable = (path: string) =>
  new GdgDataError(`Failed to fetch ${path}: 503`, false, 503);

interface StoredEntry {
  id: string;
  data: Record<string, unknown>;
  rendered?: { html: string };
}

const BASE = {
  id: "hola-foro",
  title: "Hola, foro",
  excerpt: "El primero.",
  cover_image_url: "https://gdgxica.github.io/posts/portada.webp",
  tags: ["comunidad"],
  author_name: "Ana",
  author_photo_url: "",
  published_at: "2026-09-01T10:00:00.000Z",
  status: "published",
  body: "# Hola\n\nUn párrafo del post.",
};

/** Store y logger de mentira, con la superficie que usa el loader. */
function harness() {
  const entries = new Map<string, StoredEntry>();
  const logs: { level: string; message: string }[] = [];

  return {
    entries,
    logs,
    context: {
      store: {
        clear: () => entries.clear(),
        set: (entry: StoredEntry) => entries.set(entry.id, entry),
        keys: () => [...entries.keys()],
      },
      parseData: async ({ data }: { data: Record<string, unknown> }) => data,
      // Imita a un renderizador de verdad en lo que importa aquí: envuelve en
      // una etiqueta que la comprobación del HTML admite y ESCAPA el texto,
      // que es lo que hace cualquier renderizador con el contenido de un
      // bloque de código. Sin escapar, el fake se inventaría un `<script>` que
      // el renderizador real nunca habría emitido.
      renderMarkdown: async (body: string) => ({
        html: `<p>${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</p>`,
      }),
      logger: {
        info: (message: string) => logs.push({ level: "info", message }),
        warn: (message: string) => logs.push({ level: "warn", message }),
        error: (message: string) => logs.push({ level: "error", message }),
      },
    },
  };
}

function stubRepo(posts: Record<string, unknown>[]) {
  mocks.fetchGdgData.mockImplementation((path: string) => {
    if (path === "posts/index.json") {
      // El índice real no lleva los cuerpos.
      return Promise.resolve(
        posts.map((post) => {
          const summary = { ...post };
          delete summary.body;
          return summary;
        })
      );
    }
    const post = posts.find((p) => `posts/${p.id}.json` === path);
    if (!post) return Promise.reject(notFound(path));
    return Promise.resolve(post);
  });
}

async function load(posts: Record<string, unknown>[]) {
  const h = harness();
  stubRepo(posts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await postsLoader.load(h.context as any);
  return h;
}

beforeEach(() => {
  mocks.fetchGdgData.mockReset();
});

describe("postsLoader", () => {
  it("carga un post publicado con su HTML ya renderizado", async () => {
    const { entries } = await load([BASE]);

    const entry = entries.get("hola-foro");
    expect(entry?.data.title).toBe("Hola, foro");
    expect(entry?.rendered?.html).toContain("# Hola");
  });

  // La barrera que de verdad protege: aunque la comprobación del texto dejara
  // pasar algo —es una aproximación de CommonMark—, el HTML generado se revisa
  // igual antes de guardarlo.
  it("no publica un post cuyo HTML renderizado trae algo que no admitimos", async () => {
    const h = harness();
    mocks.fetchGdgData.mockImplementation((path: string) => {
      if (path === "posts/index.json") {
        return Promise.resolve([{ ...BASE, body: undefined }]);
      }
      return Promise.resolve(BASE);
    });
    h.context.renderMarkdown = async () => ({
      html: '<p>hola</p><a href="javascript:alert(1)">pulsa</a>',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postsLoader.load(h.context as any);

    expect(h.entries.size).toBe(0);
    expect(h.logs.some((l) => l.level === "error")).toBe(true);
  });

  // El filtro vive en la única puerta por la que el contenido entra al sitio.
  it("deja fuera los borradores", async () => {
    const { entries } = await load([
      BASE,
      { ...BASE, id: "borrador", status: "draft" },
    ]);

    expect([...entries.keys()]).toEqual(["hola-foro"]);
  });

  // Estrenar la sección no puede tumbar el build del sitio entero.
  it("tolera que el repo de datos no tenga todavía carpeta posts", async () => {
    mocks.fetchGdgData.mockRejectedValue(notFound("posts/index.json"));
    const h = harness();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(postsLoader.load(h.context as any)).resolves.toBeUndefined();
    expect(h.entries.size).toBe(0);
  });

  // Un fallo transitorio del CDN durante un deploy publicaba el sitio con el
  // foro vacío, y el único rastro era una línea `info` en el log.
  it("NO confunde un fallo de lectura con un foro vacío", async () => {
    mocks.fetchGdgData.mockRejectedValue(unreachable("posts/index.json"));
    const h = harness();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(postsLoader.load(h.context as any)).rejects.toThrow("503");
  });

  it("NO publica el resto si un post concreto no se pudo leer", async () => {
    const h = harness();
    mocks.fetchGdgData.mockImplementation((path: string) => {
      if (path === "posts/index.json") {
        return Promise.resolve([{ ...BASE, body: undefined }]);
      }
      return Promise.reject(unreachable(path));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(postsLoader.load(h.context as any)).rejects.toThrow("503");
  });

  it("avisa y sigue si un post del índice no tiene fichero", async () => {
    const h = harness();
    mocks.fetchGdgData.mockImplementation((path: string) => {
      if (path === "posts/index.json") {
        return Promise.resolve([
          { ...BASE, body: undefined },
          { ...BASE, id: "fantasma", body: undefined },
        ]);
      }
      if (path === "posts/hola-foro.json") return Promise.resolve(BASE);
      return Promise.reject(notFound(path));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postsLoader.load(h.context as any);

    expect([...h.entries.keys()]).toEqual(["hola-foro"]);
    expect(h.logs.some((l) => l.level === "warn")).toBe(true);
  });

  // Segunda barrera: comprobado a mano, el renderizador de Astro deja pasar el
  // HTML en crudo, y la CSP del sitio admite scripts en línea.
  it("no publica un post con HTML en crudo, y lo dice", async () => {
    const h = await load([
      { ...BASE, id: "envenenado", body: "Hola <script>alert(1)</script>" },
      BASE,
    ]);

    expect([...h.entries.keys()]).toEqual(["hola-foro"]);
    expect(h.logs.some((l) => l.level === "error")).toBe(true);
  });

  it("acepta HTML dentro de un bloque de código", async () => {
    const { entries } = await load([
      { ...BASE, body: "```html\n<script>x</script>\n```" },
    ]);
    expect(entries.size).toBe(1);
  });

  it("quita el dominio viejo de las imágenes y deja vacío lo que no hay", async () => {
    const { entries } = await load([
      BASE,
      { ...BASE, id: "sin-portada", cover_image_url: "" },
    ]);

    expect(entries.get("hola-foro")?.data.cover).toBe("/posts/portada.webp");
    // Vacío significa "sin portada", no el placeholder: lo decide la plantilla.
    expect(entries.get("sin-portada")?.data.cover).toBe("");
  });

  it("saca un resumen del cuerpo cuando el post no trae uno", async () => {
    const { entries } = await load([{ ...BASE, excerpt: "" }]);
    expect(entries.get("hola-foro")?.data.excerpt).toBe("Un párrafo del post.");
  });
});

describe("deriveExcerpt", () => {
  it("salta títulos, citas e imágenes", () => {
    const body = [
      "# Título",
      "> una cita",
      "![foto](/x.png)",
      "",
      "Este es el primer párrafo de verdad.",
    ].join("\n");
    expect(deriveExcerpt(body)).toBe("Este es el primer párrafo de verdad.");
  });

  it("limpia la sintaxis de markdown", () => {
    expect(deriveExcerpt("Con **negrita** y [un enlace](https://x.com).")).toBe(
      "Con negrita y un enlace."
    );
  });

  it("corta por palabra entera", () => {
    const excerpt = deriveExcerpt("palabra ".repeat(40), 20);
    expect(excerpt.length).toBeLessThanOrEqual(21);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("pala…");
  });

  it("devuelve vacío si no hay párrafo", () => {
    expect(deriveExcerpt("# Solo un título")).toBe("");
  });
});

describe("readingMinutes", () => {
  it("nunca baja de un minuto", () => {
    expect(readingMinutes("dos palabras")).toBe(1);
  });

  it("redondea hacia arriba", () => {
    expect(readingMinutes("palabra ".repeat(201))).toBe(2);
  });
});
