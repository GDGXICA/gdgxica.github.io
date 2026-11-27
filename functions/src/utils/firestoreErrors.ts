export function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    code === 6 ||
    code === "already-exists" ||
    (err instanceof Error && /already exists/i.test(err.message))
  );
}

const TRANSIENT_CODES = new Set<unknown>([
  4,
  8,
  10,
  14,
  "deadline-exceeded",
  "resource-exhausted",
  "aborted",
  "unavailable",
]);

export function isTransientFirestoreError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (TRANSIENT_CODES.has(code)) return true;
  if (err instanceof Error) {
    return /aborted|unavailable|deadline exceeded|resource exhausted|contention/i.test(
      err.message
    );
  }
  return false;
}
