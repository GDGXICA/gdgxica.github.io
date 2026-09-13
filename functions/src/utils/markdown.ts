/**
 * Reglas sobre el cuerpo markdown de un post, al ESCRIBIR.
 *
 * Qué es y qué no es. Esto mira el TEXTO FUENTE, no el HTML que saldrá, y esa
 * distinción es la lección de la primera versión: reproducir las reglas de
 * bloque de CommonMark con expresiones regulares es reproducir un parser, y un
 * parser aproximado se separa del de verdad en algún sitio. La revisión de la
 * PR encontró seis entradas que pasaban limpias y acababan en `<script>` o en
 * un `href="javascript:"` en los renderizadores reales.
 *
 * Así que esta comprobación es la PRIMERA línea, no la garantía:
 *
 *  - Aquí, en la API, sirve para decirle al autor qué corregir en el momento
 *    —es el único sitio donde está delante para leerlo— y para que la basura
 *    no llegue al repo de datos.
 *  - La garantía está en `src/lib/markdown.ts`, que además revisa el HTML YA
 *    RENDERIZADO en los dos únicos sitios donde ese HTML existe: el loader del
 *    sitio y la vista previa del panel. Mirar la salida no depende de acertar
 *    con la gramática.
 *
 * Por qué hace falta todo esto: el renderizador de markdown de Astro deja
 * pasar el HTML en crudo y la CSP del sitio admite `script-src
 * 'unsafe-inline'`, de modo que un `<script>` en un cuerpo se ejecutaría en
 * gdgica.com; y la previsualización del panel se pinta dentro de la sesión de
 * quien revisa, que al mirar la propuesta de un colaborador externo está
 * renderizando texto que no ha escrito.
 *
 * Rechazar en vez de sanear es deliberado — sanear en silencio deja al autor
 * viendo un post al que le faltan trozos sin saber por qué.
 *
 * `src/lib/markdown.ts` es el espejo de cliente de la parte de fuente; el test
 * de este módulo falla si los dos se desincronizan.
 */

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
  /** Clave estable, para que quien llame decida el mensaje. */
  kind: MarkdownIssueKind;
}

/** El primer problema encontrado, o `null` si el cuerpo es markdown limpio. */
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

/** `true` si el cuerpo es markdown sin HTML en crudo. */
export function isSafeMarkdown(markdown: string): boolean {
  return findMarkdownIssue(markdown) === null;
}
