const BASE_URL = "https://raw.githubusercontent.com/GDGXICA/gdg-ica-data/main";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for dev

export async function fetchGdgData<T>(path: string): Promise<T> {
  const url = `${BASE_URL}/${path}`;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
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
