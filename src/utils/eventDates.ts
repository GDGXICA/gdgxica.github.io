// Utilidades de fecha/hora de eventos, compartidas por el JSON-LD del evento,
// el endpoint .ics y el enlace de Google Calendar.
//
// Los eventos guardan `date` como texto en español ("15 de junio de 2026") y
// `time` como rango ("09:00 AM - 05:00 PM"). Ica/Perú es UTC-5 fijo (sin DST).

import { parseSpanishDate } from "./parseSpanishDate";

const LIMA_OFFSET = "-05:00";

export interface EventDateLike {
  date: string;
  time: string;
}

export interface EventIcsLike extends EventDateLike {
  name: string;
  shortDescription: string;
  isVirtual: boolean;
  location: { name: string; direction: string };
}

/** "09:00 AM" → "09:00:00" (24h). Devuelve "00:00:00" si no matchea. */
function parseTime(t: string): string {
  const match = t.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return "00:00:00";
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}:00`;
}

/** Instante UTC en formato compacto iCalendar/Google: "YYYYMMDDTHHMMSSZ". */
function toUtcCompact(isoWithOffset: string): string {
  const d = new Date(isoWithOffset);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/**
 * Calcula las fechas de inicio/fin del evento.
 * - `startISO`/`endISO`: ISO 8601 con offset de Lima (para schema.org).
 * - `startUTC`/`endUTC`: formato compacto UTC (para .ics y Google Calendar).
 */
export function getEventDates(data: EventDateLike) {
  const parsedDate = parseSpanishDate(data.date);
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  const dateBase = `${year}-${month}-${day}`;

  const timeParts = data.time.split(" - ");
  const startISO = `${dateBase}T${parseTime(timeParts[0])}${LIMA_OFFSET}`;
  const endISO = `${dateBase}T${parseTime(timeParts[1] ?? timeParts[0])}${LIMA_OFFSET}`;

  return {
    startISO,
    endISO,
    startUTC: toUtcCompact(startISO),
    endUTC: toUtcCompact(endISO),
  };
}

/** URL de "Añadir a Google Calendar" para un evento. */
export function googleCalendarUrl(data: EventIcsLike, slug: string): string {
  const { startUTC, endUTC } = getEventDates(data);
  const eventUrl = `https://gdgica.com/eventos/${slug}`;
  const details = `${data.shortDescription}\n\n${eventUrl}`;
  const location = data.isVirtual
    ? "Evento Virtual"
    : [data.location.name, data.location.direction].filter(Boolean).join(", ");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: data.name,
    dates: `${startUTC}/${endUTC}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapa un valor de texto según RFC 5545 (iCalendar). */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Genera el contenido de un archivo .ics (VCALENDAR con un VEVENT). */
export function buildEventIcs(data: EventIcsLike, slug: string): string {
  const { startUTC, endUTC } = getEventDates(data);
  const eventUrl = `https://gdgica.com/eventos/${slug}`;
  const location = data.isVirtual
    ? "Evento Virtual"
    : [data.location.name, data.location.direction].filter(Boolean).join(", ");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GDG Ica//Eventos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${slug}@gdgica.com`,
    `DTSTAMP:${startUTC}`,
    `DTSTART:${startUTC}`,
    `DTEND:${endUTC}`,
    `SUMMARY:${escapeIcs(data.name)}`,
    `DESCRIPTION:${escapeIcs(`${data.shortDescription}\n\n${eventUrl}`)}`,
    `LOCATION:${escapeIcs(location)}`,
    `URL:${eventUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // iCalendar requiere CRLF como separador de líneas.
  return lines.join("\r\n");
}
