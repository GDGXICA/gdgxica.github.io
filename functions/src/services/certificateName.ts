// The name printed on a certificate.
//
// Roster names arrive exactly as each attendee typed them into Bevy, and a
// certificate is the one place where "MARIA JOSE QUISPE" or "maria jose
// quispe" reads as a mistake on our side. Only a name typed entirely in
// one case is re-cased: anything mixed ("McDonald", "DeLuca", "María
// josé") was a deliberate choice, or at least not one we can improve on
// by guessing.

// Joining words of Spanish names, kept lowercase unless they open the name.
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e"]);

function hasLetters(s: string): boolean {
  return s.toLocaleLowerCase("es") !== s.toLocaleUpperCase("es");
}

function capitalize(word: string): string {
  if (!word) return word;
  const [first, ...rest] = Array.from(word);
  return first.toLocaleUpperCase("es") + rest.join("");
}

// "o'brien" -> "O'Brien", "ana-lucía" -> "Ana-Lucía".
function titleWord(word: string, isFirst: boolean): string {
  const lower = word.toLocaleLowerCase("es");
  if (!isFirst && PARTICLES.has(lower)) return lower;
  return lower
    .split("-")
    .map((part) => part.split("'").map(capitalize).join("'"))
    .join("-");
}

/** Collapses whitespace and normalizes to NFC. */
export function cleanNamePart(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Title-cases a name typed entirely in upper or lower case; returns any
 * other name untouched (apart from whitespace). `leading` is false for a
 * last name, whose opening "de" or "la" stays lowercase.
 */
export function fixNameCase(name: string, leading = true): string {
  const clean = cleanNamePart(name);
  if (!hasLetters(clean)) return clean;
  const allUpper = clean === clean.toLocaleUpperCase("es");
  const allLower = clean === clean.toLocaleLowerCase("es");
  if (!allUpper && !allLower) return clean;
  return clean
    .split(" ")
    .map((w, i) => titleWord(w, leading && i === 0))
    .join(" ");
}

/**
 * First and last name as one display name. Each part is re-cased on its
 * own, since Bevy often has one in capitals and the other not ("ANA
 * LUCÍA" + "Torres"). Bevy sometimes carries the whole name in the
 * first-name field as well; when the first name already ends with the last
 * name it is not repeated.
 */
export function displayName(firstName: string, lastName: string): string {
  const first = cleanNamePart(firstName);
  const last = cleanNamePart(lastName);
  const lowerFirst = first.toLocaleLowerCase("es");
  const lowerLast = last.toLocaleLowerCase("es");
  const repeated =
    !!first &&
    (lowerFirst === lowerLast || lowerFirst.endsWith(` ${lowerLast}`));
  if (!last || repeated) return fixNameCase(first || last);
  if (!first) return fixNameCase(last);
  return `${fixNameCase(first)} ${fixNameCase(last, false)}`;
}
