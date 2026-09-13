import { describe, expect, it } from "vitest";
import { findMarkdownIssue, isSafeMarkdown, stripCode } from "./markdown";

/**
 * Entradas que la PRIMERA versión de esta comprobación daba por limpias y que,
 * renderizadas, producían `<script>`, un manejador de eventos o un
 * `href="javascript:"` — verificadas contra los dos renderizadores reales
 * durante la revisión de la PR.
 *
 * El espejo de cliente (`src/lib/__tests__/markdown.test.ts`) tiene el mismo
 * corpus y además comprueba que las dos copias clasifican igual.
 */
const BYPASSES: [string, string][] = [
  // Un bloque indentado NO puede interrumpir un párrafo: esta línea es
  // continuación del párrafo y se renderiza como contenido normal.
  ["línea indentada tras un párrafo", "hola\n    <script>alert(1)</script>"],
  ["línea indentada en una lista", "- item\n      <script>alert(1)</script>"],
  ["tabulador tras un párrafo", "hola\n\t<img src=x onerror=alert(1)>"],
  // Un tabulador delante de ``` no abre una valla: es un bloque indentado.
  // Tratarlo como valla escondía TODO lo que venía después.
  [
    "valla falsa con tabulador",
    "Hola a todos.\n\n\t```\n<script>alert(document.domain)</script>",
  ],
  // El info string de una valla de acentos graves no puede llevar acentos
  // graves, así que esto es un párrafo, no una valla.
  [
    "valla falsa con acento grave en el info string",
    "```foo`bar\n<script>alert(1)</script>",
  ],
  [
    "destino javascript: por definición de referencia",
    "Mira [esto][r].\n\n[r]: javascript:alert(1)",
  ],
  ["autoenlace con esquema ejecutable", "Pulsa <javascript:alert(1)> ahora"],
  ["destino entre ángulos", "[pulsa](<javascript:alert(1)>)"],
  [
    "vbscript por definición de referencia",
    "[a][b]\n\n[b]: vbscript:msgbox(1)",
  ],
];

describe("bypasses encontrados en la revisión", () => {
  it.each(BYPASSES)("rechaza: %s", (_name, markdown) => {
    expect(findMarkdownIssue(markdown)).not.toBeNull();
  });
});

describe("stripCode", () => {
  it("quita los bloques con valla enteros", () => {
    const md = [
      "texto",
      "```html",
      "<script>alert(1)</script>",
      "```",
      "más",
    ].join("\n");
    const { prose } = stripCode(md);
    expect(prose).not.toContain("<script>");
    expect(prose).toContain("texto");
    expect(prose).toContain("más");
  });

  it("no cierra una valla de ``` con una de ~~~", () => {
    const { prose } = stripCode("```\n~~~\n<script>\n```\nfuera");
    expect(prose).not.toContain("<script>");
  });

  it("exige que el cierre sea al menos tan largo como la apertura", () => {
    const { prose, unclosedFence } = stripCode(
      "````\ncódigo\n```\n<script>x</script>"
    );
    expect(prose).not.toContain("<script>");
    expect(unclosedFence).toBe(true);
  });

  it("quita los spans entre acentos graves", () => {
    expect(stripCode("usa `<div>` para agrupar").prose).not.toContain("<div>");
  });

  it("quita un bloque indentado de verdad, que va tras una línea en blanco", () => {
    expect(
      stripCode("texto\n\n    <script>alert(1)</script>").prose
    ).not.toContain("<script>");
  });

  // Esta es la diferencia que hacía falta: una línea indentada pegada a un
  // párrafo NO es código, y ocultarla dejaba pasar el HTML.
  it("NO quita una línea indentada que continúa un párrafo", () => {
    expect(stripCode("texto\n    <script>alert(1)</script>").prose).toContain(
      "<script>"
    );
  });

  it("señala la valla sin cerrar en vez de tragarse el resto", () => {
    expect(stripCode("```\ncódigo sin cerrar").unclosedFence).toBe(true);
    expect(stripCode("```\ncódigo\n```").unclosedFence).toBe(false);
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

  it("acepta un bloque indentado con HTML dentro", () => {
    expect(isSafeMarkdown("Ejemplo:\n\n    <div>hola</div>")).toBe(true);
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

  it("señala la valla sin cerrar con su propio motivo", () => {
    expect(findMarkdownIssue("```\nsin cerrar")?.kind).toBe("unclosed-fence");
  });

  // Un autoenlace es markdown legítimo y se parece mucho a una etiqueta.
  it("acepta autoenlaces", () => {
    expect(isSafeMarkdown("Escríbenos: <hola@gdgica.com>")).toBe(true);
    expect(isSafeMarkdown("Visita <https://gdgica.com/events>")).toBe(true);
  });

  it("rechaza esquemas ejecutables escriba como se escriba el enlace", () => {
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

  // Lo encontró el build contra un post de ejemplo: buscar el esquema en todo
  // el texto rechazaba media frase de cualquier post técnico.
  it("no confunde el nombre de un lenguaje en prosa con un esquema", () => {
    expect(isSafeMarkdown("Y en JavaScript:\n\n```js\nconst a = 1;\n```")).toBe(
      true
    );
    expect(isSafeMarkdown("Los metadata: son importantes")).toBe(true);
  });

  it("no confunde una comparación con una etiqueta", () => {
    expect(isSafeMarkdown("si a < b y b > c entonces a < c")).toBe(true);
  });
});
