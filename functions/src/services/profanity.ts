// Light first-line profanity filter for participant aliases.
//
// This is intentionally minimal — abuse during a GDG event is low-risk
// and a small denylist beats no filter at all without enforcing
// false-positive-prone rules. PR8+ may add server-side moderation if
// real abuse appears.
//
// The list is alphabetised so additions stay easy to review. Entries
// must be lowercase; comparison is done after normalising both the
// input and the denylist itself to bare a-z/0-9.

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

// U+0300–U+036F is the Combining Diacritical Marks block. Use 4-digit
// escapes so the character class works without the `u` flag and is
// preserved verbatim by Prettier and editors.
const DIACRITICS_RE = /[̀-ͯ]/g;
const NON_ASCII_ALNUM_RE = /[^a-z0-9]/g;

function normalize(raw: string): string {
  // Lowercase, strip diacritics, then strip everything else that isn't
  // bare a-z/0-9. Collapses simple bypasses ("f u c k", "fu_ck") and
  // folds accented letters ("coño" → "cono") so comparison is robust.
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(NON_ASCII_ALNUM_RE, "");
}

// Pre-normalised denylist so input.includes(term) works after both
// sides have been folded to bare lowercase ASCII.
const NORMALIZED_DENYLIST: ReadonlyArray<string> = DENYLIST.map(
  normalize
).filter((s) => s.length > 0);

export function isCleanAlias(alias: string): boolean {
  if (!alias) return false;
  const normalized = normalize(alias);
  if (!normalized) return false;
  for (const term of NORMALIZED_DENYLIST) {
    if (normalized.includes(term)) return false;
  }
  return true;
}
