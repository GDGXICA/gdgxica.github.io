import type { CollectionEntry } from "astro:content";
import { parseSpanishDate } from "./parseSpanishDate";

type EventEntry = CollectionEntry<"events">;

const timeOf = (event: EventEntry) =>
  parseSpanishDate(event.data.date).getTime();

export function sortUpcoming(events: EventEntry[]): EventEntry[] {
  return events
    .filter((event) => event.data.status.type !== "completed")
    .sort((a, b) => timeOf(a) - timeOf(b));
}

export function sortPast(events: EventEntry[]): EventEntry[] {
  return events
    .filter((event) => event.data.status.type === "completed")
    .sort((a, b) => timeOf(b) - timeOf(a));
}

export function getNextEvent(events: EventEntry[]): EventEntry | undefined {
  return sortUpcoming(events)[0];
}

export function eventDate(event: EventEntry): Date {
  return parseSpanishDate(event.data.date);
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export function formatLongDate(date: Date): string {
  return capitalize(
    date
      .toLocaleDateString("es-PE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
      .replace(",", "")
  );
}

export function formatShortDate(date: Date): string {
  return date
    .toLocaleDateString("es-PE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replace(/[.,]/g, "");
}

export function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function to24h(part: string): string | undefined {
  const match = part.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return undefined;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return `${hours}:${match[2]}`;
}

export function formatTimeRange(time: string): string {
  const [start, end] = time.split(" - ").map(to24h);
  if (!start) return time;
  return end ? `${start} a ${end}` : start;
}

export function formatStartTime(time: string): string {
  return to24h(time.split(" - ")[0]) ?? time;
}
