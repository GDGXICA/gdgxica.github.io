/**
 * Reglas sobre el cuerpo markdown de un post.
 *
 * El sitio público es estático y su CSP admite `script-src 'unsafe-inline'`,
 * así que un `<script>` que llegue al HTML se ejecuta. El markdown de un post
 * acaba renderizado a HTML en el build, y por dos caminos: el que escribe un
 * organizador, y el que propone un colaborador externo y otra persona publica
 * después de una revisión que bien puede no leer el cuerpo entero.
 *
 * De ahí que el HTML en crudo se rechace al ESCRIBIR y no al renderizar: es el
 * único punto por el que pasan los dos caminos, y el único donde el autor está
 * delante para leer el error y corregirlo. Rechazar en vez de sanear es
 * deliberado — sanear en silencio deja al autor viendo un post al que le
 * faltan trozos sin saber por qué.
 */

/**
 * Devuelve el markdown sin lo que el renderizador va a tratar como código:
 * bloques con valla (``` o ~~~) y spans entre acentos graves.
 *
 * Existe porque un post de una comunidad de desarrolladores está lleno de
 * ejemplos con `<div>`, y esos son texto, no HTML. Mirar el documento entero
 * rechazaría justo los posts que más sentido tienen aquí.
 */
export function stripCode(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;

  for (const line of markdown.split("\n")) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);

    if (fence === null) {
      if (fenceMatch) {
        fence = fenceMatch[1][0].repeat(3);
        continue;
      }
      // Un bloque indentado (4 espacios o un tabulador) también es código.
      if (/^(?: {4}|\t)/.test(line)) continue;
      // Spans entre acentos graves, incluida la forma con varios (``a `b` c``).
      out.push(line.replace(/(`+)[^`]*?\1/g, " "));
      continue;
    }

    // Dentro de una valla: solo se sale con una valla del mismo carácter.
    if (fenceMatch && fenceMatch[1][0] === fence[0]) fence = null;
  }

  return out.join("\n");
}

/**
 * Etiqueta HTML en crudo: `<p>`, `</div>`, `<img src=x onerror=y>`.
 *
 * Los autoenlaces de markdown (`<https://gdgica.com>`, `<hola@gdgica.com>`) NO
 * cuentan: tras el nombre de la etiqueta exigimos un espacio o el cierre, y en
 * un autoenlace lo que sigue es `:` o `@`.
 */
const RAW_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/;

/** `<!-- comentario -->`, `<!DOCTYPE …>`, `<![CDATA[…]]>`. */
const RAW_DECLARATION = /<!/;

/**
 * Esquemas de URL que ejecutan código al pulsar un enlace o al cargar una
 * imagen. Se miran sobre el destino de un enlace markdown —`](…)`— porque el
 * renderizador los deja pasar tal cual.
 */
const DANGEROUS_HREF = /\]\(\s*(?:javascript|vbscript|data):/i;

export interface MarkdownIssue {
  /** Clave estable, para que quien llame decida el mensaje. */
  kind: "html" | "declaration" | "href";
}

/** El primer problema encontrado, o `null` si el cuerpo es markdown limpio. */
export function findMarkdownIssue(markdown: string): MarkdownIssue | null {
  const prose = stripCode(markdown);
  if (RAW_TAG.test(prose)) return { kind: "html" };
  if (RAW_DECLARATION.test(prose)) return { kind: "declaration" };
  if (DANGEROUS_HREF.test(prose)) return { kind: "href" };
  return null;
}

export const MARKDOWN_ISSUE_MESSAGES: Record<MarkdownIssue["kind"], string> = {
  html: "no se admite HTML en el cuerpo; usa markdown (el código dentro de ``` sí puede llevar etiquetas)",
  declaration:
    "no se admiten comentarios ni declaraciones HTML (<!-- … -->) en el cuerpo",
  href: "un enlace apunta a un esquema no permitido (javascript:, data:, vbscript:)",
};

/** `true` si el cuerpo es markdown sin HTML en crudo. */
export function isSafeMarkdown(markdown: string): boolean {
  return findMarkdownIssue(markdown) === null;
}
