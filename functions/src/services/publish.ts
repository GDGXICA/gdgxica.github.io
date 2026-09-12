import { GitHubService } from "./github";

/**
 * Escritura en `gdg-ica-data` de un evento o un speaker: el fichero propio
 * más su entrada en el índice.
 *
 * Vive aquí, y no dentro de cada handler, porque ahora hay dos caminos hasta
 * la misma escritura —la creación directa desde el panel y la publicación de
 * una propuesta aprobada— y dos copias de esta lógica acabarían divergiendo
 * justo en el sitio donde importa: qué campos llegan al índice del sitio.
 */

export interface EventIndexEntry {
  id: string;
  title: string;
  description: string;
  date: string;
  end_time: string;
  venue: string;
  venue_address: string;
  venue_map_url: string;
  image_url: string;
  topics: string[];
  speaker_ids: string[];
  registration_url: string | null;
  materials: Record<string, string>;
  agenda: { time: string; title: string; speaker: string }[];
}

export function toEventIndexEntry(
  event: Record<string, unknown>
): EventIndexEntry {
  return {
    id: event.id as string,
    title: event.title as string,
    description: event.description as string,
    date: event.date as string,
    end_time: event.end_time as string,
    venue: (event.venue as string) || "",
    venue_address: (event.venue_address as string) || "",
    venue_map_url: (event.venue_map_url as string) || "",
    image_url: (event.image_url as string) || "",
    topics: (event.topics as string[]) || [],
    speaker_ids: (event.speaker_ids as string[]) || [],
    registration_url: (event.registration_url as string) || null,
    materials: (event.materials as Record<string, string>) || {},
    agenda:
      (event.agenda as { time: string; title: string; speaker: string }[]) ||
      [],
  };
}

/** `true` si ya existe un evento con ese id. */
export async function eventExists(
  github: GitHubService,
  id: string
): Promise<boolean> {
  try {
    await github.getFileContent(`events/${id}.json`);
    return true;
  } catch {
    // getFileContent lanza también ante fallos de red, no solo ante un 404.
    // Devolver `false` aquí solo significa "sigue adelante"; el `putFile`
    // posterior fallará si el problema era de red, así que no se pisa nada
    // por error.
    return false;
  }
}

export async function publishEvent(
  github: GitHubService,
  event: Record<string, unknown>
): Promise<void> {
  const id = event.id as string;

  await github.putFile(
    `events/${id}.json`,
    JSON.stringify(event, null, 2),
    `feat(events): add ${id}`
  );

  const { data: index, sha } =
    await github.getFileContent<EventIndexEntry[]>("events/index.json");
  index.push(toEventIndexEntry(event));
  await github.putFile(
    "events/index.json",
    JSON.stringify(index, null, 2),
    `feat(events): add ${id} to index`,
    sha
  );
}

/**
 * Solo se exigen los dos campos que esta función usa (ruta del fichero y
 * mensaje de commit); el resto del speaker viaja tal cual. Sin índice de
 * cadena, para que acepte las interfaces concretas de los handlers.
 */
export interface SpeakerEntry {
  id: string;
  name: string;
}

export async function speakerExists(
  github: GitHubService,
  id: string
): Promise<boolean> {
  try {
    await github.getFileContent(`speakers/${id}.json`);
    return true;
  } catch {
    return false;
  }
}

export async function publishSpeaker<T extends SpeakerEntry>(
  github: GitHubService,
  speaker: T
): Promise<void> {
  await github.putFile(
    `speakers/${speaker.id}.json`,
    JSON.stringify(speaker, null, 2),
    `feat(speakers): add ${speaker.name}`
  );

  const { data: index, sha } = await github.getFileContent<SpeakerEntry[]>(
    "speakers/index.json"
  );
  index.push(speaker);
  await github.putFile(
    "speakers/index.json",
    JSON.stringify(index, null, 2),
    `feat(speakers): add ${speaker.name} to index`,
    sha
  );
}

/**
 * Entrada del índice de posts: todo el post MENOS el cuerpo.
 *
 * El índice lo lee el sitio entero en cada build para pintar el listado, así
 * que meter ahí el markdown de cada post lo haría crecer sin tope por una
 * parte que el listado no usa. El cuerpo vive en `posts/{id}.json`.
 */
export interface PostIndexEntry {
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

export function toPostIndexEntry(
  post: Record<string, unknown>
): PostIndexEntry {
  const entry: PostIndexEntry = {
    id: post.id as string,
    title: post.title as string,
    excerpt: (post.excerpt as string) || "",
    cover_image_url: (post.cover_image_url as string) || "",
    tags: (post.tags as string[]) || [],
    author_name: (post.author_name as string) || "",
    author_photo_url: (post.author_photo_url as string) || "",
    published_at: (post.published_at as string) || "",
    status: (post.status as string) || "draft",
  };
  if (post.updated_at) entry.updated_at = post.updated_at as string;
  return entry;
}

/**
 * Lee `posts/index.json`, tolerando que todavía no exista.
 *
 * El primer post que se publique lo crea: sin esto, la primera escritura en un
 * repo de datos sin carpeta `posts/` fallaría con un 500 y el panel diría
 * "error del servidor" ante la situación más normal del mundo, que es empezar.
 * Sin `sha`, `putFile` crea el fichero.
 */
export async function readPostIndex(
  github: GitHubService
): Promise<{ entries: PostIndexEntry[]; sha?: string }> {
  try {
    const { data, sha } =
      await github.getFileContent<PostIndexEntry[]>("posts/index.json");
    return { entries: Array.isArray(data) ? data : [], sha };
  } catch {
    return { entries: [] };
  }
}

/** El post completo tal como está guardado, con su `sha`, o `null` si no existe. */
export async function readPost(
  github: GitHubService,
  id: string
): Promise<{ data: Record<string, unknown>; sha: string } | null> {
  try {
    return await github.getFileContent<Record<string, unknown>>(
      `posts/${id}.json`
    );
  } catch {
    // Igual que `eventExists`: esto también se traga un fallo de red. Quien
    // llama solo pierde el `sha`, y entonces `putFile` falla por su cuenta —
    // no se pisa nada sin querer.
    return null;
  }
}

export async function postExists(
  github: GitHubService,
  id: string
): Promise<boolean> {
  return (await readPost(github, id)) !== null;
}

/**
 * Escribe un post en el repo de datos: su fichero y su entrada en el índice.
 *
 * Sirve para crear y para actualizar —resuelve el `sha` por su cuenta— y la
 * comparten la escritura directa desde el panel y la publicación de una
 * propuesta aprobada, para que los dos caminos no puedan divergir en qué
 * campos llegan al índice.
 */
export async function publishPost(
  github: GitHubService,
  post: Record<string, unknown>
): Promise<void> {
  const id = post.id as string;
  const existing = await readPost(github, id);

  await github.putFile(
    `posts/${id}.json`,
    JSON.stringify(post, null, 2),
    existing ? `fix(posts): update ${id}` : `feat(posts): add ${id}`,
    existing?.sha
  );

  const { entries, sha } = await readPostIndex(github);
  const entry = toPostIndexEntry(post);
  const position = entries.findIndex((e) => e.id === id);
  if (position === -1) entries.push(entry);
  else entries[position] = entry;

  await github.putFile(
    "posts/index.json",
    JSON.stringify(entries, null, 2),
    `${existing ? "fix" : "feat"}(posts): ${id} in index`,
    sha
  );
}

/** Borra el post y su entrada del índice. `false` si no había tal post. */
export async function removePost(
  github: GitHubService,
  id: string
): Promise<boolean> {
  const existing = await readPost(github, id);
  if (!existing) return false;

  await github.deleteFile(
    `posts/${id}.json`,
    `chore(posts): remove ${id}`,
    existing.sha
  );

  const { entries, sha } = await readPostIndex(github);
  const remaining = entries.filter((e) => e.id !== id);
  if (remaining.length !== entries.length) {
    await github.putFile(
      "posts/index.json",
      JSON.stringify(remaining, null, 2),
      `chore(posts): remove ${id} from index`,
      sha
    );
  }

  return true;
}
