// Search tokenization for the check-in roster, plus the Bevy date parser.
//
// The panel filters attendees by prefix-matching a volunteer's query against
// the searchTokens this module builds at import time. Those two sides run in
// different bundles (browser vs Cloud Function), so the normalization is
// duplicated in src/components/react/admin/checkin/CheckinPanel.tsx. The
// contract between them is pinned by
// src/components/react/admin/checkin/__tests__/search.test.ts, which imports
// BOTH implementations — a divergence fails silently otherwise, showing the
// volunteer "no matches" for someone who is standing right in front of them.

const DIACRITICS_RE = /[̀-ͯ]/g;

// Dropped when tokenizing: they carry no identifying signal and appear
// inconsistently between what someone types and how they registered.
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
 * Lowercases, strips diacritics, and turns punctuation into separators.
 *
 * "@" and "." survive so an email address stays intact; every other
 * character becomes a space. That is what makes "Ñañez" reachable by
 * typing "nanez", and "Quintanilla-Garcia" reachable as two words.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s@.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The single tokenizer both sides use — on stored values when building the
 * index, and on the query when filtering. Running the same function on both
 * is what guarantees a match; hand-aligned character classes are what broke
 * before (a hyphenated surname tokenized to two words but queried as one).
 *
 * A piece containing "@" keeps its dots, because it is an address. Any
 * other piece splits on dots too, so a middle initial like "M." does not
 * become a token that only matches when typed with its period.
 */
export function tokenize(input: string): string[] {
  const out = new Set<string>();
  for (const piece of normalizeSearchText(input).split(" ")) {
    const parts = piece.includes("@") ? [piece] : piece.split(".");
    for (const p of parts) {
      if (p.length > 1 && !PARTICLES.has(p)) out.add(p);
    }
  }
  return [...out];
}

/** Backwards-compatible alias — name tokens are just tokenize(). */
export const nameTokens = tokenize;

/**
 * Tokens the panel filters on: name, email (whole address and local part
 * separately, so both "luis.diaz" and the full address match), and ticket
 * number. One search box covers all three.
 */
export function buildSearchTokens(a: {
  firstName: string;
  lastName: string;
  email: string;
  ticketNumber: string;
}): string[] {
  const tokens = new Set<string>(tokenize(`${a.firstName} ${a.lastName}`));

  const email = a.email.toLowerCase().trim();
  if (email) {
    for (const t of tokenize(email)) tokens.add(t);
    const local = email.split("@")[0];
    if (local) for (const t of tokenize(local)) tokens.add(t);
  }

  for (const t of tokenize(a.ticketNumber)) tokens.add(t);

  return [...tokens];
}

// Bevy's "Checkin Date (UTC)" cell, e.g. "Jul 06, 2026 - 03:10 PM".
const BEVY_DATE_RE =
  /^([a-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parses Bevy's check-in cell, returning null for anything that is not
 * exactly that format.
 *
 * Deliberately strict rather than handing the string to `new Date()`. V8's
 * legacy parser skips tokens it does not recognize, so "2026" and
 * "pending Jul 06, 2026" both yield valid Dates — and a non-null value here
 * means "already checked in on Bevy", which makes the sync skip a person who
 * never was. It also silently honours a trailing offset over the UTC the
 * column header promises. Rejecting the unexpected is the safer failure.
 */
export function parseBevyDate(raw: string): Date | null {
  const m = BEVY_DATE_RE.exec(raw.trim());
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;

  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = Number(m[4]);
  const minute = Number(m[5]);

  if (day < 1 || day > 31 || hour < 1 || hour > 12 || minute > 59) return null;

  if (m[6].toLowerCase() === "pm") {
    if (hour !== 12) hour += 12;
  } else if (hour === 12) {
    hour = 0;
  }

  const d = new Date(Date.UTC(year, month, day, hour, minute));
  // Rejects impossible dates that Date.UTC would roll over (e.g. Feb 31).
  return d.getUTCDate() === day && d.getUTCMonth() === month ? d : null;
}
