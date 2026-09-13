import { marked } from "marked";

/**
 * Reglas del markdown de los posts, del lado del sitio y del panel.
 *
 * Hay DOS comprobaciones, y la distinción importa:
 *
 *  1. Sobre el TEXTO FUENTE (`findMarkdownIssue`). Espejo de
 *     `functions/src/utils/markdown.ts`, que es lo que corre en la API al
 *     guardar. Sirve para decirle al autor qué corregir mientras escribe y
 *     para que la mayor parte de la basura no llegue al repo de datos. NO es
 *     una garantía: reproducir las reglas de bloque de CommonMark con
 *     expresiones regulares es reproducir un parser, y un parser aproximado
 *     siempre se separa del de verdad en algún sitio.
 *
 *  2. Sobre el HTML YA RENDERIZADO (`findRenderedIssue`). Esta sí es la
 *     garantía, y corre en los dos únicos sitios donde ese HTML existe: el
 *     loader del sitio (con la salida de Astro) y la vista previa del panel
 *     (con la salida de `marked`). Mira lo que de verdad se va a pintar, así
 *     que no depende de acertar con la gramática.
 *
 * Por qué hace falta la segunda: el renderizador de markdown de Astro deja
 * pasar el HTML en crudo y la CSP del sitio admite `script-src
 * 'unsafe-inline'`, de modo que un `<script>` en el cuerpo se ejecuta en
 * gdgica.com. Y la previsualización se pinta con `dangerouslySetInnerHTML`
 * dentro de la sesión de quien revisa — que al revisar la propuesta de un
 * colaborador externo está renderizando texto que no ha escrito.
 *
 * La primera versión de esto solo tenía (1), y la revisión de la PR encontró
 * seis entradas que la cruzaban limpias y acababan en `<script>` o en un
 * `href="javascript:"` en los dos renderizadores: una línea indentada tras un
 * párrafo (que NO es un bloque de código: un bloque indentado no puede
 * interrumpir un párrafo), lo mismo dentro de un elemento de lista, una valla
 * falsa con tabulador o con acentos graves en el info string (que se tragaba
 * el resto del documento), y destinos `javascript:` por definición de
 * referencia, por autoenlace o entre ángulos. Están todas en
 * `__tests__/markdown.test.ts` como corpus.
 */

// --- 1. Comprobación sobre el texto fuente -------------------------------

interface Fence {
  char: string;
  length: number;
}

/**
 * Apertura de un bloque con valla, o `null`.
 *
 * Indentación de hasta TRES ESPACIOS, no `\s`: un tabulador delante hace que
 * la línea sea un bloque indentado y no una valla, y tratarla como valla era
 * justo lo que dejaba el resto del documento fuera de la comprobación.
 */
function openingFence(line: string): Fence | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;

  const [, marker, info] = match;
  // El info string de una valla de acentos graves no puede contener acentos
  // graves: ```a`b no es una valla, es un párrafo normal.
  if (marker[0] === "`" && info.includes("`")) return null;

  return { char: marker[0], length: marker.length };
}

/** El cierre tiene que ser del mismo carácter y al menos igual de largo. */
function closesFence(line: string, fence: Fence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  if (!match) return false;
  return match[1][0] === fence.char && match[1].length >= fence.length;
}

export interface StrippedMarkdown {
  /** El documento sin lo que el renderizador va a tratar como código. */
  prose: string;
  /** `true` si quedó una valla sin cerrar. Quien llama lo trata como error. */
  unclosedFence: boolean;
}

/**
 * Devuelve el markdown sin sus bloques y spans de código.
 *
 * Existe porque un post de una comunidad de desarrolladores está lleno de
 * ejemplos con `<div>`, y esos son texto, no HTML. Mirar el documento entero
 * rechazaría justo los posts que más sentido tienen aquí.
 *
 * Cuando duda, ENSEÑA la línea en vez de ocultarla: un falso positivo es un
 * post rechazado que se corrige; un falso negativo es un `<script>` publicado.
 */
export function stripCode(markdown: string): StrippedMarkdown {
  const out: string[] = [];
  let fence: Fence | null = null;
  // Un bloque indentado solo empieza donde NO hay un párrafo abierto: en
  // CommonMark un bloque indentado no puede interrumpir un párrafo, así que
  // una línea indentada detrás de texto es continuación de ese párrafo y se
  // renderiza como contenido normal.
  let paragraphOpen = false;

  for (const line of markdown.split("\n")) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    const opener = openingFence(line);
    if (opener) {
      fence = opener;
      paragraphOpen = false;
      continue;
    }

    if (/^(?: {4}|\t)/.test(line) && !paragraphOpen) {
      continue;
    }

    out.push(line.replace(/(`+)[^`]*?\1/g, " "));
    paragraphOpen = line.trim().length > 0;
  }

  return { prose: out.join("\n"), unclosedFence: fence !== null };
}

/**
 * Etiqueta HTML en crudo: `<p>`, `</div>`, `<img src=x onerror=y>`.
 *
 * Los autoenlaces de markdown (`<https://gdgica.com>`, `<hola@gdgica.com>`) NO
 * cuentan: tras el nombre de la etiqueta exigimos un espacio o el cierre, y en
 * un autoenlace lo que sigue es `:` o `@`. De los `<javascript:…>` se encarga
 * `DANGEROUS_SCHEME`.
 */
const RAW_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/;

/** `<!-- comentario -->`, `<!DOCTYPE …>`, `<![CDATA[…]]>`. */
const RAW_DECLARATION = /<!/;

/**
 * Esquemas que ejecutan código, en las posiciones donde markdown pone el
 * DESTINO de un enlace: inline `](…)`, entre ángulos `](<…>)`, definición de
 * referencia `[id]: …` y autoenlace `<…>`.
 *
 * La versión anterior solo miraba `](…)` y se le colaban las otras tres. La
 * siguiente buscó el esquema en todo el texto y se pasó de frenada: rechazaba
 * "Y en JavaScript:", que es como empieza media frase de un post técnico —lo
 * cazó el build contra un post de ejemplo—. Atarlo a la posición del destino
 * cubre las cuatro formas sin morder la prosa.
 *
 * Que quede algo exótico fuera es aceptable, y es el motivo por el que esta no
 * es la única defensa: `findRenderedIssue` mira el `href` ya construido, donde
 * un esquema es un esquema lo haya escrito uno como lo haya escrito.
 */
const DANGEROUS_SCHEME = new RegExp(
  "(?:" +
    // [texto](destino) y [texto](<destino>)
    "\\]\\(\\s*<?\\s*" +
    // [id]: destino  — definición de referencia, al principio de una línea
    "|^ {0,3}\\[[^\\]]*\\]:\\s*<?\\s*" +
    // <autoenlace>
    "|<" +
    ")" +
    "(?:javascript|vbscript|data)\\s*:",
  "im"
);

export type MarkdownIssueKind =
  "html" | "declaration" | "href" | "unclosed-fence";

export interface MarkdownIssue {
  kind: MarkdownIssueKind;
}

export function findMarkdownIssue(markdown: string): MarkdownIssue | null {
  const { prose, unclosedFence } = stripCode(markdown);
  // Una valla sin cerrar convierte todo lo que sigue en código, así que la
  // comprobación dejaría de mirar el resto del documento. Es además un error
  // de escritura de verdad: el post se publicaría con medio cuerpo dentro de
  // un bloque de código.
  if (unclosedFence) return { kind: "unclosed-fence" };
  if (RAW_TAG.test(prose)) return { kind: "html" };
  if (RAW_DECLARATION.test(prose)) return { kind: "declaration" };
  if (DANGEROUS_SCHEME.test(prose)) return { kind: "href" };
  return null;
}

export const MARKDOWN_ISSUE_MESSAGES: Record<MarkdownIssueKind, string> = {
  html: "no se admite HTML en el cuerpo; usa markdown (el código dentro de ``` sí puede llevar etiquetas)",
  declaration:
    "no se admiten comentarios ni declaraciones HTML (<!-- … -->) en el cuerpo",
  href: "un enlace apunta a un esquema no permitido (javascript:, data:, vbscript:)",
  "unclosed-fence":
    "hay un bloque de código (```) sin cerrar; ciérralo para que el resto del post no quede dentro",
};

export function isSafeMarkdown(markdown: string): boolean {
  return findMarkdownIssue(markdown) === null;
}

// --- 2. Comprobación sobre el HTML renderizado ---------------------------

/**
 * Etiquetas que puede emitir un renderizador de markdown. Lista blanca: lo
 * que no está, no pasa. Si algún día el renderizador emite una etiqueta nueva
 * y legítima, el post se rechaza con un mensaje que la nombra — molesto, pero
 * es el lado correcto en el que equivocarse.
 */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "b",
  "i",
  "del",
  "s",
  "mark",
  "small",
  "sub",
  "sup",
  "code",
  "pre",
  "span",
  "blockquote",
  "q",
  "cite",
  "abbr",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  // Listas de tareas de GFM.
  "input",
  // Las notas al pie de GFM salen envueltas en <section>.
  "section",
  "figure",
  "figcaption",
]);

/** Atributos permitidos, además de los prefijos `data-` y `aria-`. */
const ALLOWED_ATTRS = new Set([
  "href",
  "src",
  "srcset",
  "alt",
  "title",
  "class",
  "id",
  "style",
  "start",
  "type",
  "checked",
  "disabled",
  "colspan",
  "rowspan",
  "align",
  "tabindex",
  "role",
  "lang",
  "dir",
  "reversed",
  "value",
  "width",
  "height",
  "loading",
  "decoding",
  "rel",
  "target",
]);

/** Atributos cuyo valor es una URL y hay que mirar. */
const URL_ATTRS = new Set(["href", "src", "srcset", "cite"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  Tab: "\t",
  NewLine: "\n",
  colon: ":",
  sol: "/",
  nbsp: " ",
};

/**
 * Decodifica las entidades de un valor de atributo.
 *
 * El navegador las decodifica al parsear el HTML, así que mirar el valor tal
 * cual dejaría pasar `&#106;avascript:` — y satteri, el renderizador del
 * sitio, además ya lo decodifica él al construir el `href`.
 */
export function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi,
    (match, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_ENTITIES[body] ?? match;
    }
  );
}

/**
 * `true` si la URL es de un esquema que no ejecuta nada.
 *
 * Se normaliza antes de mirarla porque el navegador ignora los espacios y los
 * caracteres de control dentro del esquema: `java\tscript:` es `javascript:`.
 * Una URL relativa (sin esquema) siempre vale.
 */
export function isSafeUrl(raw: string): boolean {
  const value = decodeEntities(raw)
    // Espacios y caracteres de control: el navegador los ignora dentro del
    // esquema, de modo que "java\tscript:" se resuelve como "javascript:".
    // Quitarlos ES el objetivo, de ahí la excepción de la regla.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020]/g, "")
    .toLowerCase();

  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(value);
  if (!scheme) return true; // relativa o ancla
  return ["http", "https", "mailto"].includes(scheme[1]);
}

export type RenderedIssueKind = "tag" | "attribute" | "url" | "declaration";

export interface RenderedIssue {
  kind: RenderedIssueKind;
  /** La etiqueta, atributo o URL concretos, para poder decir cuál. */
  detail: string;
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;
const ATTR_RE =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

/**
 * Revisa el HTML que el renderizador acaba de producir.
 *
 * Esta es la comprobación que de verdad protege, porque mira la salida en vez
 * de predecirla. Es un VALIDADOR, no un saneador: ante cualquier cosa que no
 * reconoce devuelve el problema y quien llama se niega a pintar. Sobre HTML
 * generado —no sobre HTML arbitrario de la red— eso es una posición
 * defendible: todo lo que no encaje con lo que emite un renderizador de
 * markdown es, por definición, algo que no debería estar ahí.
 */
export function findRenderedIssue(html: string): RenderedIssue | null {
  if (/<!/.test(html)) {
    return { kind: "declaration", detail: "<!…>" };
  }

  TAG_RE.lastIndex = 0;
  let tag: RegExpExecArray | null;
  while ((tag = TAG_RE.exec(html)) !== null) {
    const name = tag[1].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) {
      return { kind: "tag", detail: `<${name}>` };
    }

    ATTR_RE.lastIndex = 0;
    let attr: RegExpExecArray | null;
    while ((attr = ATTR_RE.exec(tag[2])) !== null) {
      const attrName = attr[1].toLowerCase();
      if (attrName.startsWith("data-") || attrName.startsWith("aria-")) {
        continue;
      }
      if (!ALLOWED_ATTRS.has(attrName)) {
        // Aquí caen todos los `onclick`, `onerror`, `onload`…
        return { kind: "attribute", detail: `${attrName} en <${name}>` };
      }
      if (!URL_ATTRS.has(attrName) || attr[2] === undefined) continue;

      const value = attr[2].replace(/^["']|["']$/g, "");
      if (!isSafeUrl(value)) {
        return { kind: "url", detail: value.slice(0, 60) };
      }
    }
  }

  return null;
}

export const RENDERED_ISSUE_MESSAGES: Record<RenderedIssueKind, string> = {
  tag: "el HTML resultante lleva una etiqueta que no admitimos",
  attribute: "el HTML resultante lleva un atributo que no admitimos",
  url: "el HTML resultante lleva un enlace a un esquema no permitido",
  declaration: "el HTML resultante lleva un comentario o declaración HTML",
};

/** Mensaje completo de un problema del HTML renderizado, con el detalle. */
export function describeRenderedIssue(issue: RenderedIssue): string {
  return `${RENDERED_ISSUE_MESSAGES[issue.kind]}: ${issue.detail}`;
}

// --- Vista previa del panel ----------------------------------------------

export type MarkdownPreview = { html: string } | { error: string };

/**
 * Markdown a HTML para la vista previa del editor.
 *
 * Solo para el panel: el sitio público lo renderiza Astro en el build, así que
 * `marked` nunca llega al visitante. Devuelve el motivo en vez de lanzar,
 * porque el editor tiene que poder enseñarlo mientras se escribe.
 *
 * Primero la comprobación del texto —que da el mensaje accionable— y después
 * la del HTML generado, que es la que manda: si esta última encuentra algo, no
 * se pinta, por muy limpio que pareciera el markdown.
 */
export function renderMarkdownPreview(markdown: string): MarkdownPreview {
  const issue = findMarkdownIssue(markdown);
  if (issue) return { error: MARKDOWN_ISSUE_MESSAGES[issue.kind] };

  const html = marked.parse(markdown, { async: false, gfm: true }) as string;

  const rendered = findRenderedIssue(html);
  if (rendered) return { error: describeRenderedIssue(rendered) };

  return { html };
}
