// Short forms of event data for places with little room: the home page's
// event readout and event log. Ica is UTC-5 all year, and
// every date is formatted in that zone so a build machine in another zone
// cannot shift the day.

const LIMA = "America/Lima";

function part(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, ...opts })
    .format(date)
    .replace(".", "")
    .toLowerCase();
}

/** "9:00–13:30", 24-hour like a printed programme. */
export function hourRange(startIso: string, endIso: string): string {
  const f = (iso: string) =>
    new Intl.DateTimeFormat("es-PE", {
      timeZone: LIMA,
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  return `${f(startIso)}–${f(endIso)}`;
}

/**
 * "Universidad Tecnologica del Peru (UTP) - Sede Ica" → "UTP Ica";
 * "Zegel - Sede Ica" → "Zegel"; virtual events → "En línea".
 */
export function shortVenue(venue: string, isVirtual: boolean): string {
  if (isVirtual) return "En línea";
  const acronym = venue.match(/\(([A-ZÁÉÍÓÚÑ]{2,})\)/)?.[1];
  return acronym ? `${acronym} Ica` : venue.split(" - ")[0].trim();
}

/** "28.11.2026" — the survey sheet's date, day first like Peru writes it. */
export function dottedDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("day")}.${get("month")}.${get("year")}`;
}

/** "sáb 28.11.2026". */
export function surveyDate(iso: string): string {
  return `${part(new Date(iso), { weekday: "short" })} ${dottedDate(iso)}`;
}
