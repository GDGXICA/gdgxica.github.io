/**
 * Digits only. Grouping key for duplicate detection.
 *
 * Mirrors normalizeDni in functions/src/services/credentialSearch.ts. The
 * two live in different bundles and cannot import each other; a test pins
 * them to agree.
 */
export function normalizeDni(dni: string): string {
  return dni.replace(/\D/g, "");
}

/**
 * Hides all but the last four digits.
 *
 * The DNI is the most sensitive field this codebase stores, and
 * persistentLocalCache (enabled app-wide in src/lib/firebase.ts) writes
 * whatever a page subscribes to onto every organizer's disk. Masking by
 * default limits what a screenshot or a glance over a shoulder leaks; the
 * queue reveals a single row on demand.
 */
export function maskDni(dni: string): string {
  const digits = normalizeDni(dni);
  if (digits.length <= 4) return digits;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
