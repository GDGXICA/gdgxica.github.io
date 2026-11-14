// The home page lets a visitor type their name onto a preview credential and
// then sends them here with `?nombre=...`. Without this, the name they just
// typed vanished on arrival — the page's best moment ended in a blank form.
//
// The first word is the first name and the rest the last name, which is the
// common Spanish order ("María José Quispe Huamaní" splits after "María"; the
// form stays editable for anyone the guess does not suit). Each part is capped
// at the server's limit so a pasted novel cannot produce a payload the API
// would reject later.

export const PREFILL_PARAM = "nombre";
const MAX_PART = 60;

export function nameFromQuery(search: string): {
  firstName: string;
  lastName: string;
} | null {
  const raw = new URLSearchParams(search).get(PREFILL_PARAM);
  if (!raw) return null;
  const words = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const [first, ...rest] = words;
  return {
    firstName: first.slice(0, MAX_PART),
    lastName: rest.join(" ").slice(0, MAX_PART),
  };
}
