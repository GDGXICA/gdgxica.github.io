import type { Loader } from "astro/loaders";
import { fetchGdgData, formatSpanishDate, stripDomain } from "./fetch-gdg-data";
import { findMarkdownIssue } from "../lib/markdown";

/**
 * Posts del foro.
 *
 * Es el único loader con forma de objeto en vez de una función que devuelve un
 * array: necesita el `renderMarkdown` del contexto para convertir el cuerpo a
 * HTML en el build. Sin eso, la página tendría que renderizar markdown en el
 * navegador, que es enviar un parser al cliente para pintar texto que no
 * cambia nunca.
 */

interface ExternalPostIndexEntry {
  id: string;
  title: string;
  excerpt: string;
  cover_image_url: string;
  tags: string[];
  author_name: string;
  author_photo_url: string;
  published_at: string;
  status: string;
  updated_at?: string;
}

interface ExternalPost extends ExternalPostIndexEntry {
  body: string;
}

const WORDS_PER_MINUTE = 200;

/** Minutos de lectura, redondeados hacia arriba y nunca menos de uno. */
export function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * Resumen de emergencia cuando el post no trae `excerpt`: el primer párrafo de
 * verdad, sin la sintaxis de markdown que quedaría fea en una tarjeta o en una
 * tarjeta de Twitter.
 */
export function deriveExcerpt(markdown: string, maxChars = 180): string {
  const paragraph = markdown
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith(">") &&
        !line.startsWith("!") &&
        !line.startsWith("```")
    );
  if (!paragraph) return "";

  const plain = paragraph
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // enlaces e imágenes
    .replace(/[*_`~]/g, "")
    .trim();

  if (plain.length <= maxChars) return plain;
  // Se corta en la última palabra entera para no dejar una sílaba suelta.
  return `${plain.slice(0, maxChars).replace(/\s+\S*$/, "")}…`;
}

function toEntry(post: ExternalPost) {
  const excerpt = post.excerpt?.trim() || deriveExcerpt(post.body ?? "");
  return {
    title: post.title,
    excerpt,
    // `stripDomain` devuelve el placeholder ante un valor vacío, y aquí vacío
    // significa "este post no tiene portada": la plantilla decide.
    cover: post.cover_image_url ? stripDomain(post.cover_image_url) : "",
    tags: post.tags ?? [],
    author: {
      name: post.author_name ?? "",
      avatar: post.author_photo_url ? stripDomain(post.author_photo_url) : "",
    },
    publishedAt: post.published_at,
    publishedLabel: post.published_at
      ? formatSpanishDate(post.published_at)
      : "",
    updatedAt: post.updated_at ?? "",
    readingMinutes: readingMinutes(post.body ?? ""),
  };
}

export const postsLoader: Loader = {
  name: "gdg-posts",
  async load({ store, parseData, renderMarkdown, logger }) {
    store.clear();

    let index: ExternalPostIndexEntry[];
    try {
      index = await fetchGdgData<ExternalPostIndexEntry[]>("posts/index.json");
    } catch {
      // El repo de datos todavía no tiene carpeta `posts/`: el foro existe
      // pero está vacío. No es un error del build, y tratarlo como tal dejaría
      // el sitio entero sin construir por una sección sin estrenar.
      logger.info("Sin posts todavía (posts/index.json no existe)");
      return;
    }

    // Un borrador vive en el repo de datos pero no sale publicado. El filtro
    // está AQUÍ, en la única puerta por la que el contenido entra al sitio:
    // ninguna página puede olvidarse de aplicarlo.
    const published = index.filter((post) => post.status === "published");

    for (const summary of published) {
      let post: ExternalPost;
      try {
        post = await fetchGdgData<ExternalPost>(`posts/${summary.id}.json`);
      } catch {
        // Un post del índice cuyo fichero falta es contenido roto, no un
        // motivo para tirar el build: el resto del foro se publica igual y el
        // aviso queda en el log de la build.
        logger.warn(`Post "${summary.id}" está en el índice pero no existe`);
        continue;
      }

      // Segunda barrera, después de la de la API. Comprobado a mano: el
      // renderizador de markdown de Astro deja pasar el HTML en crudo tal
      // cual, y la CSP del sitio admite `script-src 'unsafe-inline'`, así que
      // un `<script>` en el cuerpo se ejecutaría en gdgica.com. La API no deja
      // escribirlo, pero el repo de datos tiene otras puertas —un commit a
      // mano— y esta es la única por la que pasan todas.
      //
      // El post se salta entero en vez de publicarse saneado: sanear en
      // silencio publicaría una versión mutilada que nadie revisó.
      const issue = findMarkdownIssue(post.body ?? "");
      if (issue) {
        logger.error(
          `Post "${summary.id}" NO publicado: el cuerpo lleva HTML en crudo ` +
            `(${issue.kind}). Edítalo desde el panel.`
        );
        continue;
      }

      store.set({
        id: summary.id,
        data: await parseData({ id: summary.id, data: toEntry(post) }),
        rendered: await renderMarkdown(post.body ?? ""),
      });
    }

    logger.info(
      `${store.keys().length} de ${published.length} post(s) del foro cargados`
    );
  },
};
