import { describe, expect, it } from "vitest";
import { marked } from "marked";
import {
  MARKDOWN_ISSUE_MESSAGES,
  decodeEntities,
  findMarkdownIssue,
  findRenderedIssue,
  isSafeMarkdown,
  isSafeUrl,
  renderMarkdownPreview,
  stripCode,
} from "../markdown";
// La autoridad de la comprobación sobre el texto: es quien decide qué entra al
// repo de datos. Si este import deja de resolver, el espejo se quedó sin nada
// con lo que compararse.
import * as server from "../../../functions/src/utils/markdown";

/**
 * Entradas que la PRIMERA versión de esta defensa daba por limpias y que, una
 * vez renderizadas, producían `<script>`, un manejador de eventos o un
 * `href="javascript:"` — verificadas contra los dos renderizadores reales
 * (satteri en el sitio, marked en el panel) durante la revisión de la PR.
 *
 * Están aquí como corpus permanente: cada una tiene que quedar rechazada por
 * la comprobación del texto Y, aunque esa fallara, por la del HTML generado.
 */
const BYPASSES: { name: string; markdown: string }[] = [
  {
    // Un bloque indentado NO puede interrumpir un párrafo: esta línea es
    // continuación del párrafo y se renderiza como contenido normal.
    name: "línea indentada tras un párrafo",
    markdown: "hola\n    <script>alert(1)</script>",
  },
  {
    name: "línea indentada dentro de un elemento de lista",
    markdown: "- item\n      <script>alert(1)</script>",
  },
  {
    name: "tabulador tras un párrafo",
    markdown: "hola\n\t<img src=x onerror=alert(1)>",
  },
  {
    // Un tabulador delante de ``` no abre una valla: es un bloque indentado.
    // Tratarlo como valla escondía TODO lo que venía después.
    name: "valla falsa con tabulador",
    markdown: "Hola a todos.\n\n\t```\n<script>alert(document.domain)</script>",
  },
  {
    // El info string de una valla de acentos graves no puede llevar acentos
    // graves, así que esto es un párrafo, no una valla.
    name: "valla falsa con acento grave en el info string",
    markdown: "```foo`bar\n<script>alert(1)</script>",
  },
  {
    name: "destino javascript: por definición de referencia",
    markdown: "Mira [esto][r].\n\n[r]: javascript:alert(1)",
  },
  {
    name: "autoenlace con esquema ejecutable",
    markdown: "Pulsa <javascript:alert(1)> ahora",
  },
  {
    name: "destino entre ángulos",
    markdown: "[pulsa](<javascript:alert(1)>)",
  },
  {
    name: "vbscript por definición de referencia",
    markdown: "[a][b]\n\n[b]: vbscript:msgbox(1)",
  },
];

describe("bypasses encontrados en la revisión", () => {
  it.each(BYPASSES)(
    "la comprobación del texto rechaza: $name",
    ({ markdown }) => {
      expect(findMarkdownIssue(markdown)).not.toBeNull();
    }
  );

  it.each(BYPASSES)(
    "la vista previa se niega a pintar: $name",
    ({ markdown }) => {
      expect("error" in renderMarkdownPreview(markdown)).toBe(true);
    }
  );

  // La red de verdad: aunque la comprobación del texto volviera a fallar en
  // alguna de estas —es una aproximación de CommonMark y puede volver a
  // separarse del parser—, la del HTML generado las caza igual.
  it.each(BYPASSES)(
    "la comprobación del HTML generado caza la salida de: $name",
    ({ markdown }) => {
      const html = marked.parse(markdown, {
        async: false,
        gfm: true,
      }) as string;
      expect(findRenderedIssue(html)).not.toBeNull();
    }
  );
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
    // Las tres comillas de la línea 3 no cierran una valla de cuatro.
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
    const { prose } = stripCode("texto\n\n    <script>alert(1)</script>");
    expect(prose).not.toContain("<script>");
  });

  it("NO quita una línea indentada que continúa un párrafo", () => {
    const { prose } = stripCode("texto\n    <script>alert(1)</script>");
    expect(prose).toContain("<script>");
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
    expect(findMarkdownIssue("[a][b]\n\n[b]: javascript:alert(1)")?.kind).toBe(
      "href"
    );
  });

  it("no confunde una palabra que acaba en el nombre de un esquema", () => {
    expect(isSafeMarkdown("Los metadata: son importantes")).toBe(true);
  });

  // Lo encontró el build contra un post de ejemplo: una regla que buscaba el
  // esquema en todo el texto rechazaba media frase de cualquier post técnico.
  it("no confunde el nombre de un lenguaje en prosa con un esquema", () => {
    expect(isSafeMarkdown("Y en JavaScript:\n\n```js\nconst a = 1;\n```")).toBe(
      true
    );
    expect(isSafeMarkdown("El esquema javascript: da miedo")).toBe(true);
    expect(isSafeMarkdown("Data: los números del año")).toBe(true);
  });

  it("no confunde una comparación con una etiqueta", () => {
    expect(isSafeMarkdown("si a < b y b > c entonces a < c")).toBe(true);
  });
});

describe("decodeEntities", () => {
  it("decodifica numéricas, hexadecimales y con nombre", () => {
    expect(decodeEntities("&#106;avascript")).toBe("javascript");
    expect(decodeEntities("&#x6a;avascript")).toBe("javascript");
    expect(decodeEntities("java&Tab;script")).toBe("java\tscript");
    expect(decodeEntities("a&amp;b")).toBe("a&b");
  });

  it("deja intacto lo que no es una entidad", () => {
    expect(decodeEntities("https://gdgica.com/?a=1&b=2")).toBe(
      "https://gdgica.com/?a=1&b=2"
    );
  });
});

describe("isSafeUrl", () => {
  it("acepta lo que no ejecuta nada", () => {
    expect(isSafeUrl("https://gdgica.com")).toBe(true);
    expect(isSafeUrl("http://gdgica.com")).toBe(true);
    expect(isSafeUrl("mailto:hola@gdgica.com")).toBe(true);
    expect(isSafeUrl("/foro/mi-post")).toBe(true);
    expect(isSafeUrl("#seccion")).toBe(true);
  });

  it("rechaza los esquemas que ejecutan", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  // El navegador decodifica las entidades del atributo antes de resolverlo, y
  // satteri además ya las decodifica al construir el href.
  it("rechaza un esquema escondido tras entidades", () => {
    expect(isSafeUrl("&#106;avascript:alert(1)")).toBe(false);
    expect(isSafeUrl("&#x6a;avascript:alert(1)")).toBe(false);
  });

  // El navegador ignora espacios y caracteres de control dentro del esquema.
  it("rechaza un esquema partido con espacios o control", () => {
    expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeUrl(" javascript:alert(1)")).toBe(false);
  });
});

describe("findRenderedIssue", () => {
  it("acepta el HTML que produce un renderizador de markdown", () => {
    const html =
      '<h1 id="t">Título</h1><p>Un <strong>párrafo</strong> con ' +
      '<a href="https://gdgica.com">enlace</a> y ' +
      '<img src="/posts/x.png" alt="x" loading="lazy"></p>' +
      '<pre class="astro-code" style="background-color:#24292e" tabindex="0" ' +
      'data-language="js"><code><span style="color:#F97583">const</span>' +
      "</code></pre>";
    expect(findRenderedIssue(html)).toBeNull();
  });

  it("acepta listas de tareas y notas al pie", () => {
    const html =
      '<ul><li><input type="checkbox" disabled checked> hecho</li></ul>' +
      '<section data-footnotes class="footnotes"><ol><li id="fn-1">nota ' +
      '<a href="#ref-1" data-footnote-backref aria-label="volver">↩</a>' +
      "</li></ol></section>";
    expect(findRenderedIssue(html)).toBeNull();
  });

  it("caza una etiqueta que un renderizador de markdown no emite", () => {
    expect(
      findRenderedIssue("<p>hola</p><script>alert(1)</script>")
    ).toMatchObject({ kind: "tag", detail: "<script>" });
    expect(
      findRenderedIssue('<iframe src="https://evil.tld"></iframe>')?.kind
    ).toBe("tag");
    expect(findRenderedIssue("<svg onload=alert(1)>")?.kind).toBe("tag");
  });

  it("caza un manejador de eventos", () => {
    expect(
      findRenderedIssue('<img src="/x.png" onerror="alert(1)">')
    ).toMatchObject({ kind: "attribute" });
    expect(findRenderedIssue("<p onclick=alert(1)>hola</p>")?.kind).toBe(
      "attribute"
    );
  });

  it("caza un href ejecutable, aunque venga codificado", () => {
    expect(findRenderedIssue('<a href="javascript:alert(1)">x</a>')?.kind).toBe(
      "url"
    );
    expect(
      findRenderedIssue('<a href="&#106;avascript:alert(1)">x</a>')?.kind
    ).toBe("url");
    expect(
      findRenderedIssue('<a href="java&Tab;script:alert(1)">x</a>')?.kind
    ).toBe("url");
  });

  it("caza un comentario HTML", () => {
    expect(findRenderedIssue("<p>a</p><!-- x -->")?.kind).toBe("declaration");
  });

  // El texto escapado de un bloque de código no es HTML y no debe disparar
  // nada: es justo el contenido que estos posts van a tener.
  it("no se confunde con código escapado", () => {
    const html =
      "<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>";
    expect(findRenderedIssue(html)).toBeNull();
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

  it("no deja pasar un javascript: dentro del HTML generado", () => {
    const result = renderMarkdownPreview(
      "[normal](https://gdgica.com)\n\n![img](https://gdgica.com/x.png)"
    );
    expect("html" in result && result.html).not.toContain("javascript:");
  });
});

/**
 * El panel enseña el error antes de guardar y la API lo rechaza al guardar. Si
 * discreparan, o bien el panel rechazaría algo publicable, o —peor— dejaría
 * escribir algo que luego la API tumba con un error que el autor ya no
 * relaciona con nada.
 */
describe("espejo de functions/src/utils/markdown", () => {
  const CASES = [
    ...BYPASSES.map((b) => b.markdown),
    "# Un post normal\n\nCon **negrita** y [enlace](https://gdgica.com).",
    "Escríbenos: <hola@gdgica.com> o pásate por <https://gdgica.com>",
    "```html\n<script>alert(1)</script>\n```",
    "Hola <script>alert(1)</script>",
    "<div>bloque</div>",
    "<!-- comentario -->",
    "si a < b y b > c entonces a < c",
    "usa `<div>` para agrupar",
    "texto\n\n    <script>indentado de verdad</script>",
    "texto</div>",
    "Los metadata: son importantes",
    "Y en JavaScript:\n\n```js\nconst a = 1;\n```",
    "````\ncódigo\n```\nsigue",
  ];

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
      expect(stripCode(markdown)).toEqual(server.stripCode(markdown));
    }
  });

  it("usa los mismos mensajes", () => {
    expect(MARKDOWN_ISSUE_MESSAGES).toEqual(server.MARKDOWN_ISSUE_MESSAGES);
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
