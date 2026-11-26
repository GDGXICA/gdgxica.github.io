// What the panel accepts as an email address.
//
// The same pattern zod 4 uses for `.email()` on the server (zod's
// "practical email" regex), so a row the panel lets through is a row the
// API accepts. The panel's old check was looser, and a single address like
// `josé@x.com` or `ana@x.c` made the server reject a whole batch with
// "Invalid request body" and no row to point at.
// functions/src/schemas/emailParity.test.ts fails if the two drift.
export const EMAIL_RE =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Trimmed and lowercased, as the server stores it. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}
