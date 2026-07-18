// Name normalization shared by the check-in roster import (search tokens)
// and, later, by the DNI lookup's candidate matching.

// Dropped when tokenizing names: they carry no identifying signal and
// their presence is inconsistent between RENIEC and self-typed Bevy names.
const PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "da",
  "dos",
  "van",
  "von",
]);

/**
 * Lowercases, strips diacritics and punctuation, collapses whitespace.
 *
 * The diacritic strip is what makes "Ñañez" and "Nanez" comparable — a
 * volunteer typing into the search box will not reach for ñ or í, and
 * Bevy names are self-typed so they are inconsistently accented.
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized, de-particled, deduped tokens of a name. */
export function nameTokens(input: string): string[] {
  const seen = new Set<string>();
  for (const t of normalizeName(input).split(" ")) {
    if (t.length > 1 && !PARTICLES.has(t)) seen.add(t);
  }
  return [...seen];
}

/**
 * Tokens the check-in panel filters on. Includes name parts, the email
 * (both whole and local-part), and the ticket number, so a volunteer can
 * type any of them into one search box.
 */
export function buildSearchTokens(a: {
  firstName: string;
  lastName: string;
  email: string;
  ticketNumber: string;
}): string[] {
  const tokens = new Set<string>(nameTokens(`${a.firstName} ${a.lastName}`));
  const email = a.email.toLowerCase().trim();
  if (email) {
    tokens.add(email);
    const local = email.split("@")[0];
    if (local) tokens.add(local);
  }
  const ticket = a.ticketNumber.toLowerCase().trim();
  if (ticket) tokens.add(ticket);
  return [...tokens];
}

/**
 * Parses Bevy's "Checkin Date (UTC)" cell, e.g.
 * "Jul 06, 2026 - 03:10 PM". Returns null for an empty or unparseable
 * cell — an unparseable date must not be mistaken for "already checked
 * in on Bevy", since that would make the sync skip the person.
 */
export function parseBevyDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // Drop the " - " between date and time, and pin to UTC as the header
  // promises; without the suffix V8 would apply the server's local zone.
  const d = new Date(`${s.replace(/\s+-\s+/, " ")} UTC`);
  return Number.isNaN(d.getTime()) ? null : d;
}
