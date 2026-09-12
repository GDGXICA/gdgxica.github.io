import { describe, expect, it } from "vitest";
import {
  MARKDOWN_ISSUE_MESSAGES,
  findMarkdownIssue,
  isSafeMarkdown,
  renderMarkdownPreview,
  stripCode,
} from "../markdown";
// La autoridad: es quien decide qué entra al repo de datos. Si este import
// deja de resolver, el espejo se quedó sin nada con lo que compararse.
import * as server from "../../../functions/src/utils/markdown";

/**
 * Casos que tienen que dar lo MISMO en las dos copias. El panel enseña el
 * error antes de guardar y la API lo rechaza al guardar: si discreparan, o
 * bien el panel rechazaría algo publicable, o —peor— dejaría escribir algo
 * que luego la API tumba con un error que el autor ya no relaciona con nada.
 */
const CASES = [
  "# Un post normal\n\nCon **negrita** y [enlace](https://gdgica.com).",
  "Escríbenos: <hola@gdgica.com> o pásate por <https://gdgica.com>",
  "```html\n<script>alert(1)</script>\n```",
  "Hola <script>alert(1)</script>",
  "<div>bloque</div>",
  "<!-- comentario -->",
  "[pulsa](javascript:alert(1))",
  "![x](data:text/html;base64,AAA)",
  "si a < b y b > c entonces a < c",
  "usa `<div>` para agrupar",
  "    <script>indentado</script>",
  "texto</div>",
];

describe("espejo de functions/src/utils/markdown", () => {
  it("clasifica igual que la autoridad", () => {
    for (const markdown of CASES) {
      expect(
        findMarkdownIssue(markdown)?.kind ?? null,
        `discrepancia en: ${markdown.slice(0, 40)}`
      ).toBe(server.findMarkdownIssue(markdown)?.kind ?? null);
    }
  });

  it("quita el código igual que la autoridad", () => {
    for (const markdown of CASES) {
      expect(stripCode(markdown)).toBe(server.stripCode(markdown));
    }
  });

  it("usa los mismos mensajes", () => {
    expect(MARKDOWN_ISSUE_MESSAGES).toEqual(server.MARKDOWN_ISSUE_MESSAGES);
  });
});

describe("renderMarkdownPreview", () => {
  it("renderiza markdown normal", () => {
    const result = renderMarkdownPreview("# Hola\n\nUn **párrafo**.");
    expect("html" in result && result.html).toContain("<h1");
    expect("html" in result && result.html).toContain("<strong>");
  });

  it("escapa el HTML que va dentro de un bloque de código", () => {
    const result = renderMarkdownPreview("```html\n<script>x</script>\n```");
    expect("html" in result).toBe(true);
    if ("html" in result) {
      expect(result.html).toContain("&lt;script&gt;");
      expect(result.html).not.toContain("<script>");
    }
  });

  // La previsualización de la propuesta de un colaborador se pinta DENTRO de
  // la sesión de quien revisa: aquí es donde un <script> haría más daño.
  it("se niega a renderizar HTML en crudo y explica por qué", () => {
    const result = renderMarkdownPreview("Hola <script>alert(1)</script>");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("HTML");
  });

  it("se niega ante un enlace con esquema ejecutable", () => {
    const result = renderMarkdownPreview("[pulsa](javascript:alert(1))");
    expect("error" in result).toBe(true);
  });

  it("no deja pasar un javascript: dentro del HTML generado", () => {
    const result = renderMarkdownPreview(
      "[normal](https://gdgica.com)\n\n![img](https://gdgica.com/x.png)"
    );
    expect("html" in result && result.html).not.toContain("javascript:");
  });
});

describe("isSafeMarkdown", () => {
  it("acepta un post de verdad", () => {
    const body = [
      "# Guía rápida",
      "",
      "Instala con:",
      "",
      "```bash",
      "pnpm add firebase",
      "```",
      "",
      "Y mira <https://firebase.google.com>.",
    ].join("\n");
    expect(isSafeMarkdown(body)).toBe(true);
  });
});
