export interface Recipient {
  name: string;
  email: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Splits a CSV/TSV blob into {name,email} rows. Accepts comma, semicolon
// or tab separators, skips a header row if the first line looks like
// one, tolerates any column order, and joins remaining columns as the
// full name (so "email,firstName,lastName" combines first + last).
export function parseCsv(text: string): Recipient[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const split = (line: string) => line.split(/[,;\t]/).map((c) => c.trim());
  const first = split(lines[0]).join(" ").toLowerCase();
  const hasHeader =
    first.includes("email") ||
    first.includes("correo") ||
    first.includes("nombre") ||
    first.includes("name");
  const body = hasHeader ? lines.slice(1) : lines;

  const out: Recipient[] = [];
  for (const line of body) {
    const cols = split(line).filter(Boolean);
    if (cols.length < 2) continue;
    const emailIdx = cols.findIndex((c) => EMAIL_RE.test(c));
    const email = emailIdx >= 0 ? cols[emailIdx] : cols[cols.length - 1];
    const nameParts =
      emailIdx >= 0 ? cols.filter((_, i) => i !== emailIdx) : cols.slice(0, -1);
    const name = nameParts.join(" ").replace(/\s+/g, " ").trim();
    if (name && email) out.push({ name, email });
  }
  return out;
}
