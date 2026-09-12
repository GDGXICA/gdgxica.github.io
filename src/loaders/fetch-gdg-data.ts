import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const BASE_URL = "https://raw.githubusercontent.com/GDGXICA/gdg-ica-data/main";

// In CI we clone gdg-ica-data to a local path before running the build
// and point the loader at it via GDG_DATA_LOCAL_PATH. This bypasses the
// raw.githubusercontent.com CDN (which has ~5 minutes of staleness and
// would otherwise serve pre-commit JSON right after an admin save).
const LOCAL_PATH = process.env.GDG_DATA_LOCAL_PATH
  ? resolve(process.env.GDG_DATA_LOCAL_PATH)
  : undefined;

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for dev

/**
 * Error de lectura del repo de datos, con la distinción que importa: si el
 * fichero NO EXISTE (404 / ENOENT) o si no se pudo leer (red, 5xx, cuota).
 *
 * Sin esta diferencia, un loader que tolera contenido ausente —el foro, que
 * puede no tener todavía carpeta `posts/`— tolera también una caída del CDN, y
 * un fallo transitorio durante un deploy publica el sitio con esa sección
 * vacía sin que nada falle.
 */
export class GdgDataError extends Error {
  constructor(
    message: string,
    readonly notFound: boolean,
    readonly status?: number
  ) {
    super(message);
    this.name = "GdgDataError";
  }
}

/** `true` si el fallo fue "ese fichero no está", y no "no se pudo leer". */
export function isNotFound(error: unknown): boolean {
  return error instanceof GdgDataError && error.notFound;
}

export async function fetchGdgData<T>(path: string): Promise<T> {
  if (LOCAL_PATH) {
    // Containment check: ensure the resolved path stays inside LOCAL_PATH
    // so a compromised index.json with "../" segments can't read files
    // outside the data repo clone.
    const filePath = resolve(LOCAL_PATH, path);
    if (filePath !== LOCAL_PATH && !filePath.startsWith(LOCAL_PATH + sep)) {
      throw new Error(`Refusing to read path outside data repo: ${path}`);
    }
    try {
      const contents = await readFile(filePath, "utf-8");
      return JSON.parse(contents) as T;
    } catch (err) {
      const code = (err as { code?: string }).code;
      throw new GdgDataError(
        `Failed to read ${filePath}: ${String(err)}`,
        code === "ENOENT"
      );
    }
  }

  const url = `${BASE_URL}/${path}`;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new GdgDataError(
      `Failed to fetch ${url}: ${response.status}`,
      response.status === 404,
      response.status
    );
  }

  const data = await response.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data as T;
}

export function stripDomain(url: string | null | undefined): string {
  if (!url) return "/placeholder.svg";
  return url.replace("https://gdgxica.github.io", "");
}

export function formatSpanishDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(isoDate: string, endTime: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  const start = `${h12.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${period}`;
  return `${start} - ${endTime}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  devfest: "DevFest",
  io: "Google I/O",
  studyjam: "Study Jam",
  wtm: "Women Techmakers",
  meetup: "Meetup",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Próximo",
  "in-progress": "En progreso",
  completed: "Finalizado",
};

export function expandCategory(type: string): { label: string; type: string } {
  return { label: CATEGORY_LABELS[type] || type, type };
}

export function expandStatus(type: string): { label: string; type: string } {
  return { label: STATUS_LABELS[type] || type, type };
}
