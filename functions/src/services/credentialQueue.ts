// Pure scheduling logic for the credential email queue.
//
// Split out from the trigger so backoff, lease expiry and the daily budget
// key are unit-testable without an emulator. Nothing here touches
// Firestore or nodemailer.
//
// Why a queue at all: handlers/certificates.ts sends inline and discards,
// and that already tripped Gmail's "454-4.7.0 Too many login attempts".
// Sending inline here would mean the attendee waits on SMTP, a throttle
// becomes a 500 on submit, and there is no retry. The attendee already
// holds their PNG when the form returns — the email must never sit on the
// critical path.

/**
 * How long a document may sit in `sending` before another run may reclaim
 * it. Long enough that a slow SMTP handshake is not stolen mid-flight,
 * short enough that a crashed invocation does not strand a credential.
 */
export const LEASE_SECONDS = 300;

/** Attempts before a credential is parked as `failed` for manual retry. */
export const MAX_ATTEMPTS = 6;

/**
 * Ceiling on sends per calendar day (America/Lima).
 *
 * Consumer Gmail caps daily sends well below its documented limit in
 * practice, and this account also sends certificates. The budget is what
 * stops a burst of registrations from consuming the whole day's quota.
 */
export const DAILY_CAP = 350;

/** Documents claimed per run. 40 every 5 min is 480/hour. */
export const BATCH = 40;

const MAX_BACKOFF_SECONDS = 6 * 60 * 60;
const JITTER = 0.2;

/**
 * Exponential backoff with +/-20% jitter, capped at six hours.
 *
 * The jitter matters because a Gmail throttle fails the whole batch at
 * once: without it every one of those documents would come back at the
 * same instant and trip the throttle again.
 *
 * `rand` is injectable because Math.random cannot be asserted on.
 */
export function computeBackoff(attempts: number, rand = Math.random): number {
  const safeAttempts = Math.max(1, Math.trunc(attempts));
  const base = Math.min(2 ** safeAttempts * 60, MAX_BACKOFF_SECONDS);
  const factor = 1 + (rand() * 2 - 1) * JITTER;
  return Math.round(base * factor);
}

/**
 * Whether a document stuck in `sending` may be reclaimed.
 *
 * A null timestamp means the claim never recorded an attempt time, which
 * only happens if the process died between the two writes — reclaim it.
 */
export function isLeaseStale(
  lastAttemptAt: Date | null,
  now: Date,
  leaseSeconds = LEASE_SECONDS
): boolean {
  if (!lastAttemptAt) return true;
  return now.getTime() - lastAttemptAt.getTime() >= leaseSeconds * 1000;
}

/**
 * Budget document id: the calendar day in America/Lima.
 *
 * Deliberately Lima and not UTC. The cap exists to protect a quota that
 * resets on Google's clock, but the humans reading the panel and deciding
 * whether sends are stuck think in local time, and an event that runs
 * until 19:00 Lima would otherwise straddle two budget documents mid-day.
 */
export function budgetDocId(now: Date): string {
  // en-CA gives YYYY-MM-DD directly, which sorts chronologically as a
  // document id.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Remaining sends allowed today. Never negative. */
export function remainingBudget(sentToday: number, cap = DAILY_CAP): number {
  return Math.max(0, cap - Math.max(0, sentToday));
}

/** Whether another attempt is allowed, or the document is parked. */
export function hasAttemptsLeft(
  attempts: number,
  maxAttempts = MAX_ATTEMPTS
): boolean {
  return attempts < maxAttempts;
}
