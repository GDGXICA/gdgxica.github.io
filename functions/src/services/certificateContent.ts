import type { CertificateKind } from "./certificateKinds";

// What a certificate says about its event, and where that comes from.
//
// Events in the data repo store `date` as local ISO without a zone
// ("2026-11-28T09:00:00") and `end_time` as free 12-hour text ("01:30
// PM"). Both are read with regexes here, never with `new Date`: Cloud
// Functions run in UTC, and a Date would quietly move a Lima evening event
// to the next day.
//
// Settings store times as 24-hour "HH:mm" and are formatted only when the
// PDF is drawn. Before this, the panel reformatted the start time but
// passed the end time through raw, so a certificate could read "9:00 a.m.
// a 02:00 PM".

export interface CertificateSettings {
  eventName: string;
  /** YYYY-MM-DD */
  eventDate: string;
  /** HH:mm, 24-hour */
  startTime: string;
  /** HH:mm, 24-hour */
  endTime: string;
  /** Hours credited to attendees (and volunteers without their own). */
  hours: number;
}

export interface EventSource {
  title?: unknown;
  date?: unknown;
  end_time?: unknown;
}

interface Time {
  h: number;
  m: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toHHmm = ({ h, m }: Time) => `${pad(h)}:${pad(m)}`;

/** "01:30 PM", "1:30 p.m.", "13:30", "9 am" -> { h, m }; null if unreadable. */
export function parseClock(raw: string): Time | null {
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  const period = match[3]?.replace(/[.\s]/g, "");
  if (m > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return { h, m };
}

/** Whole hours between two clock times, crossing midnight if needed. */
export function hoursBetween(start: string, end: string): number {
  const s = parseClock(start);
  const e = parseClock(end);
  if (!s || !e) return 0;
  let minutes = e.h * 60 + e.m - (s.h * 60 + s.m);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

/** "13:30" -> "1:30 p.m."; "00:05" -> "12:05 a.m.". Raw text if unreadable. */
export function formatTimeEs(hhmm: string): string {
  const t = parseClock(hhmm);
  if (!t) return hhmm.trim();
  const period = t.h < 12 ? "a.m." : "p.m.";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${h12}:${pad(t.m)} ${period}`;
}

/**
 * Settings derived from the event JSON. Fields that cannot be read come
 * back empty (or 0), for the organizer to fill in before sending.
 */
export function deriveSettings(event: EventSource): CertificateSettings {
  const title = typeof event.title === "string" ? event.title.trim() : "";
  const date = typeof event.date === "string" ? event.date.trim() : "";
  const match = date.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  const eventDate = match ? match[1] : "";
  const start =
    match && match[2] !== undefined
      ? parseClock(`${match[2]}:${match[3]}`)
      : null;
  const end =
    typeof event.end_time === "string" ? parseClock(event.end_time) : null;
  const startTime = start ? toHHmm(start) : "";
  const endTime = end ? toHHmm(end) : "";
  return {
    eventName: title,
    eventDate,
    startTime,
    endTime,
    hours: startTime && endTime ? hoursBetween(startTime, endTime) : 0,
  };
}

/**
 * What is still missing before a certificate of this kind can be sent.
 * Speakers are not credited hours, so they do not need them.
 */
export function missingSettings(
  settings: Partial<CertificateSettings> | null | undefined,
  kind: CertificateKind
): string[] {
  const missing: string[] = [];
  if (!settings?.eventName?.trim()) missing.push("eventName");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings?.eventDate ?? ""))
    missing.push("eventDate");
  if (!parseClock(settings?.startTime ?? "")) missing.push("startTime");
  if (!parseClock(settings?.endTime ?? "")) missing.push("endTime");
  if (kind !== "speaker" && !(Number(settings?.hours) > 0))
    missing.push("hours");
  return missing;
}

/** The event fields of buildCertificatePdf's input, formatted for print. */
export function pdfEventFields(
  settings: CertificateSettings,
  hoursOverride?: number | null
): {
  eventName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  hours: number;
} {
  return {
    eventName: settings.eventName.trim(),
    eventDate: settings.eventDate,
    startTime: formatTimeEs(settings.startTime),
    endTime: formatTimeEs(settings.endTime),
    hours:
      hoursOverride && hoursOverride > 0 ? hoursOverride : settings.hours || 0,
  };
}
