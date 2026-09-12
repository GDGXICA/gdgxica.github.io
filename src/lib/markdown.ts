import { marked } from "marked";

/**
 * Reglas del markdown de los posts, del lado del sitio y del panel.
 *
 * Espejo de `functions/src/utils/markdown.ts`, que es la autoridad porque es
 * quien decide qué entra al repo de datos. `markdown.test.ts` de ese módulo
 * falla si los dos se desincronizan.
 *
 * Aquí se usa dos veces:
 *
 *  - En el loader del sitio (`loaders/transform-posts.ts`), como segunda
 *    barrera. Comprobado a mano: el renderizador de markdown de Astro deja
 *    pasar el HTML en crudo tal cual, y la CSP del sitio admite
 *    `script-src 'unsafe-inline'`, así que un `<script>` en el cuerpo se
 *    ejecuta. La API no deja escribir eso, pero el repo de datos tiene otras
 *    puertas —un commit a mano— y esta es la única que pasan todas.
 *
 *  - En la vista previa del editor, que es donde más importa: quien revisa la
 *    propuesta de un colaborador externo pinta en SU sesión de admin un texto
 *    que no ha escrito. Por eso la previsualización valida ANTES de renderizar
 *    y se niega a pintar lo que no pasa: con el cuerpo ya libre de HTML en
 *    crudo y de esquemas ejecutables, la salida de `marked` solo puede
 *    contener las etiquetas que genera el propio markdown.
 */

/** Devuelve el markdown sin lo que el renderizador tratará como código. */
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
      if (/^(?: {4}|\t)/.test(line)) continue;
      out.push(line.replace(/(`+)[^`]*?\1/g, " "));
      continue;
    }

    if (fenceMatch && fenceMatch[1][0] === fence[0]) fence = null;
  }

  return out.join("\n");
}

const RAW_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/;
const RAW_DECLARATION = /<!/;
const DANGEROUS_HREF = /\]\(\s*(?:javascript|vbscript|data):/i;

export type MarkdownIssueKind = "html" | "declaration" | "href";

export interface MarkdownIssue {
  kind: MarkdownIssueKind;
}

export function findMarkdownIssue(markdown: string): MarkdownIssue | null {
  const prose = stripCode(markdown);
  if (RAW_TAG.test(prose)) return { kind: "html" };
  if (RAW_DECLARATION.test(prose)) return { kind: "declaration" };
  if (DANGEROUS_HREF.test(prose)) return { kind: "href" };
  return null;
}

export const MARKDOWN_ISSUE_MESSAGES: Record<MarkdownIssueKind, string> = {
  html: "no se admite HTML en el cuerpo; usa markdown (el código dentro de ``` sí puede llevar etiquetas)",
  declaration:
    "no se admiten comentarios ni declaraciones HTML (<!-- … -->) en el cuerpo",
  href: "un enlace apunta a un esquema no permitido (javascript:, data:, vbscript:)",
};

export function isSafeMarkdown(markdown: string): boolean {
  return findMarkdownIssue(markdown) === null;
}

export type MarkdownPreview = { html: string } | { error: string };

/**
 * Markdown a HTML para la vista previa del editor.
 *
 * Solo para el panel: el sitio público lo renderiza Astro en el build, así que
 * `marked` nunca llega al visitante. Devuelve el motivo en vez de lanzar,
 * porque el editor tiene que poder enseñarlo mientras se escribe.
 */
export function renderMarkdownPreview(markdown: string): MarkdownPreview {
  const issue = findMarkdownIssue(markdown);
  if (issue) return { error: MARKDOWN_ISSUE_MESSAGES[issue.kind] };

  return {
    html: marked.parse(markdown, { async: false, gfm: true }) as string,
  };
}
