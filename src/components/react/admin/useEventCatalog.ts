import { useEffect, useState } from "react";

export interface CatalogEvent {
  slug: string;
  name: string;
  date: Date | null;
  time: string;
  place: string;
  participants: number;
  maxParticipants: number;
  status: "upcoming" | "in-progress" | "completed";
}

interface RawEntry {
  id: string;
  data: {
    name: string;
    date: string;
    time: string;
    isVirtual: boolean;
    location: { name: string };
    participants: number;
    maxParticipants: number;
    status: { type: CatalogEvent["status"] };
  };
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parseSpanishDate(value: string): Date | null {
  const match = value
    .toLowerCase()
    .match(/(\d{1,2}) de ([a-záéíóúñ]+) de (\d{4})/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]);
  if (month === -1) return null;
  return new Date(Number(match[3]), month, Number(match[1]));
}

let cache: Promise<CatalogEvent[]> | null = null;

function load(): Promise<CatalogEvent[]> {
  if (!cache) {
    cache = fetch("/events.json")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<RawEntry[]>;
      })
      .then((entries) =>
        entries.map((entry) => {
          return {
            slug: entry.id,
            name: entry.data.name,
            date: parseSpanishDate(entry.data.date),
            time: entry.data.time,
            place: entry.data.isVirtual ? "Virtual" : entry.data.location.name,
            participants: entry.data.participants,
            maxParticipants: entry.data.maxParticipants,
            status: entry.data.status.type,
          };
        })
      );
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export function useEventCatalog() {
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    load()
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { events, failed, retry: () => setAttempt((n) => n + 1) };
}
