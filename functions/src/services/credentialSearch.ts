import { buildSearchTokens, tokenize } from "./nameMatch";

/**
 * Digits only. Used as the grouping key for duplicate detection.
 *
 * Duplicate DNIs are never blocked — that would let anyone lock a real
 * person out of registering by claiming their number first — so this key
 * exists to make conflicts VISIBLE in the admin panel, not to reject
 * writes. Normalizing means "1234 5678" and "12345678" group together
 * instead of hiding the conflict behind a formatting difference.
 */
export function normalizeDni(dni: string): string {
  return dni.replace(/\D/g, "");
}

/**
 * Hides all but the last four digits for list views.
 *
 * The DNI is the most sensitive field this codebase stores, and
 * persistentLocalCache (enabled app-wide in src/lib/firebase.ts) writes
 * whatever a page subscribes to onto every organizer's disk. Masking by
 * default limits what a screenshot or a glance over a shoulder leaks; the
 * panel reveals a single row on demand.
 */
export function maskDni(dni: string): string {
  const digits = normalizeDni(dni);
  if (digits.length <= 4) return digits;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * Prefix-matchable tokens for the credentials panel search box.
 *
 * Delegates to nameMatch.buildSearchTokens with the DNI in the
 * ticketNumber slot — same role, an identifier someone types into a search
 * box — so a credential and its eventual roster row tokenize through the
 * exact same code path. That shared path is what makes reconciliation
 * between the two collections work, and its contract is already pinned
 * against the browser-side copy in CheckinPanel.tsx by
 * src/components/react/admin/checkin/__tests__/search.test.ts.
 */
export function buildCredentialSearchTokens(input: {
  firstName: string;
  lastName: string;
  email: string;
  dni: string;
  githubUsername?: string | null;
}): string[] {
  const tokens = new Set(
    buildSearchTokens({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      ticketNumber: normalizeDni(input.dni),
    })
  );

  if (input.githubUsername) {
    for (const t of tokenize(input.githubUsername)) tokens.add(t);
  }

  return [...tokens];
}
