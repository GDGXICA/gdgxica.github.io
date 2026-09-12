import { describe, expect, it } from "vitest";
import { postSchema } from "./index";

const MINIMAL = { id: "mi-post", title: "Mi post", body: "Hola **foro**." };

describe("postSchema", () => {
  it("rellena los opcionales con defaults utilizables", () => {
    const parsed = postSchema.parse(MINIMAL);
    expect(parsed).toMatchObject({
      excerpt: "",
      cover_image_url: "",
      tags: [],
      status: "draft",
      published_at: "",
    });
  });

  it("exige un id con forma de slug", () => {
    expect(
      postSchema.safeParse({ ...MINIMAL, id: "con espacios" }).success
    ).toBe(false);
    expect(postSchema.safeParse({ ...MINIMAL, id: "../../etc" }).success).toBe(
      false
    );
  });

  it("exige título", () => {
    expect(postSchema.safeParse({ ...MINIMAL, title: "" }).success).toBe(false);
  });

  // El cuerpo se renderiza a HTML en el build del sitio. Ver utils/markdown.ts.
  it("rechaza HTML en crudo en el cuerpo", () => {
    const result = postSchema.safeParse({
      ...MINIMAL,
      body: "Hola <script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("HTML");
  });

  it("acepta HTML dentro de un bloque de código", () => {
    const body = ["Ejemplo:", "", "```html", "<h1>Hola</h1>", "```"].join("\n");
    expect(postSchema.safeParse({ ...MINIMAL, body }).success).toBe(true);
  });

  it("rechaza enlaces con esquemas ejecutables", () => {
    expect(
      postSchema.safeParse({
        ...MINIMAL,
        body: "[pulsa](javascript:alert(1))",
      }).success
    ).toBe(false);
  });

  it("exige http(s) en la portada", () => {
    expect(
      postSchema.safeParse({
        ...MINIMAL,
        cover_image_url: "javascript:alert(1)",
      }).success
    ).toBe(false);
  });

  it("rechaza una fecha de publicación ilegible", () => {
    expect(
      postSchema.safeParse({ ...MINIMAL, published_at: "el martes" }).success
    ).toBe(false);
    expect(
      postSchema.safeParse({ ...MINIMAL, published_at: "2026-09-11T10:00:00Z" })
        .success
    ).toBe(true);
  });

  // El editor carga el post guardado, lo esparce y lo devuelve entero: si el
  // esquema estricto no admitiera `updated_at`, editar daría 400.
  it("admite el updated_at que devuelve el editor", () => {
    expect(
      postSchema.safeParse({
        ...MINIMAL,
        updated_at: "2026-09-11T10:00:00.000Z",
      }).success
    ).toBe(true);
  });

  it("rechaza claves desconocidas", () => {
    expect(
      postSchema.safeParse({ ...MINIMAL, autor_favorito: "yo" }).success
    ).toBe(false);
  });
});
