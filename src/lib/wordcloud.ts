// Public-side helpers for the word cloud mini-game.
//
// `normalizeWord` produces the canonical doc id we use under
// events/{slug}/minigames/{id}/words/{normalized}. Same canonical form
// = same doc, so duplicates merge naturally via FieldValue.increment(1).
//
// `isCleanWord` mirrors `functions/src/services/profanity.ts` so the
// client surfaces obvious rejections before round-tripping. Server is
// still source of truth (Firestore rules and admin moderation).

const MAX_LENGTH = 60;

const DENYLIST: ReadonlyArray<string> = [
  // Spanish
  "cabron",
  "carajo",
  "chinga",
  "concha",
  "coño",
  "culiao",
  "joto",
  "marica",
  "maricon",
  "mierda",
  "pendejo",
  "puta",
  "puto",
  "verga",
  // English
  "asshole",
  "bastard",
  "bitch",
  "cunt",
  "dick",
  "fag",
  "fuck",
  "nigger",
  "nigga",
  "pussy",
  "shit",
  "slut",
  "twat",
  "whore",
];

const DIACRITICS_RE = /[̀-ͯ]/g;
const NON_ASCII_ALNUM_RE = /[^a-z0-9]/g;

function fold(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(NON_ASCII_ALNUM_RE, "");
}

const NORMALIZED_DENYLIST: ReadonlyArray<string> = DENYLIST.map(fold).filter(
  (s) => s.length > 0
);

// Display-friendly normalisation: collapse whitespace, lowercase, trim,
// strip diacritics so "Hola" / "HOLA" / "hólà" all share the same
// bucket. Returns "" when the input collapses to empty.
export function normalizeWord(raw: string): string {
  if (!raw) return "";
  const collapsed = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.slice(0, MAX_LENGTH);
}

export function isCleanWord(text: string): boolean {
  if (!text) return false;
  const folded = fold(text);
  if (!folded) return false;
  for (const term of NORMALIZED_DENYLIST) {
    if (folded.includes(term)) return false;
  }
  return true;
}

export const WORD_MAX_LENGTH = MAX_LENGTH;
