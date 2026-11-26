// Dates and times as the certificate prints them, for the panel's summaries.

/** "13:30" -> "1:30 p.m." */
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  const period = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
}

/** "2026-11-28" -> "sábado, 28 de noviembre de 2026" (no time zone shift). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Hours between two "HH:mm" times, crossing midnight; 0 if unreadable. */
export function hoursBetween(start: string, end: string): number {
  const a = /^(\d{1,2}):(\d{2})$/.exec(start);
  const b = /^(\d{1,2}):(\d{2})$/.exec(end);
  if (!a || !b) return 0;
  let minutes =
    Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

/** "28 nov., 10:42" */
export function formatMoment(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
