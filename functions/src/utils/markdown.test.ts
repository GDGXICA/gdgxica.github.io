import { describe, expect, it } from "vitest";
import { findMarkdownIssue, isSafeMarkdown, stripCode } from "./markdown";

describe("stripCode", () => {
  it("quita los bloques con valla enteros", () => {
    const md = [
      "texto",
      "```html",
      "<script>alert(1)</script>",
      "```",
      "más",
    ].join("\n");
    expect(stripCode(md)).not.toContain("<script>");
    expect(stripCode(md)).toContain("texto");
    expect(stripCode(md)).toContain("más");
  });

  it("no cierra una valla de ``` con una de ~~~", () => {
    const md = ["```", "~~~", "<script>", "```", "fuera"].join("\n");
    expect(stripCode(md)).not.toContain("<script>");
  });

  it("quita los spans entre acentos graves", () => {
    expect(stripCode("usa `<div>` para agrupar")).not.toContain("<div>");
  });

  it("quita los bloques indentados", () => {
    expect(stripCode("texto\n\n    <script>alert(1)</script>")).not.toContain(
      "<script>"
    );
  });
});

describe("findMarkdownIssue", () => {
  it("acepta markdown normal", () => {
    const md = [
      "# Título",
      "",
      "Un párrafo con **negrita**, [un enlace](https://gdgica.com) y una",
      "imagen: ![alt](https://gdgica.com/x.png)",
      "",
      "- lista",
      "- de cosas",
    ].join("\n");
    expect(findMarkdownIssue(md)).toBeNull();
  });

  it("acepta HTML dentro de un bloque de código", () => {
    const md = [
      "Así se escribe un botón:",
      "",
      "```html",
      '<button onclick="alert(1)">Hola</button>',
      "```",
    ].join("\n");
    expect(isSafeMarkdown(md)).toBe(true);
  });

  it("rechaza una etiqueta en crudo", () => {
    expect(findMarkdownIssue("hola <script>alert(1)</script>")?.kind).toBe(
      "html"
    );
    expect(findMarkdownIssue('<img src=x onerror="alert(1)">')?.kind).toBe(
      "html"
    );
    expect(findMarkdownIssue("texto</div>")?.kind).toBe("html");
  });

  it("rechaza comentarios y declaraciones", () => {
    expect(findMarkdownIssue("<!-- oculto -->")?.kind).toBe("declaration");
  });

  // Un autoenlace es markdown legítimo y se parece mucho a una etiqueta.
  it("acepta autoenlaces", () => {
    expect(isSafeMarkdown("Escríbenos: <hola@gdgica.com>")).toBe(true);
    expect(isSafeMarkdown("Visita <https://gdgica.com/events>")).toBe(true);
  });

  it("rechaza enlaces con esquemas ejecutables", () => {
    expect(findMarkdownIssue("[pulsa](javascript:alert(1))")?.kind).toBe(
      "href"
    );
    expect(findMarkdownIssue("[pulsa]( JavaScript:alert(1))")?.kind).toBe(
      "href"
    );
    expect(findMarkdownIssue("![x](data:text/html;base64,AAA)")?.kind).toBe(
      "href"
    );
  });

  it("no confunde una comparación con una etiqueta", () => {
    expect(isSafeMarkdown("si a < b y b > c entonces a < c")).toBe(true);
  });
});
