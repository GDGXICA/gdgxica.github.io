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
