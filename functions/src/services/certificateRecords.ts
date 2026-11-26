import { createHash } from "node:crypto";
import type { Timestamp } from "firebase-admin/firestore";
import type { CertificateKind } from "./certificateKinds";
import type { CertificateSettings } from "./certificateContent";

// The `certificates/{id}` collection: one document per person and kind,
// per event (or per manual submission). Server-only — firestore.rules
// denies every client read and write; the panel goes through the API.

export const CERTIFICATES = "certificates";

export const CERTIFICATE_STATUSES = [
  // Registered (volunteer/speaker) or touched (attendee name fix), not sent.
  "pending",
  // Waiting for the drain.
  "queued",
  // Claimed by a drain run; `nextAttemptAt` is the lease expiry.
  "sending",
  // Accepted by the mail server. Not proof of delivery: bounces come back
  // to the GDG ICA inbox and are never matched here.
  "sent",
  // Out of attempts; waits for a manual retry.
  "failed",
  // Dropped by the drain because the attendee no longer has a check-in.
  "cancelled",
  // Left out by an organizer.
  "excluded",
] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export type CertificateSource = "roster" | "registered" | "manual";

export interface CertificateDoc {
  eventSlug: string | null;
  kind: CertificateKind;
  source: CertificateSource;
  rosterId?: string | null;
  /**
   * An organizer corrected this attendee's name or email; the roster's
   * values (refreshed on every Bevy import) no longer replace them.
   */
  overridden?: boolean;
  /** Manual certificates: the event the data was taken from, if any. */
  eventRef?: string | null;
  firstName: string;
  lastName: string;
  /** Name printed on the certificate. */
  name: string;
  email: string;
  /** Volunteers may be credited their own hours instead of the event's. */
  hours?: number | null;
  status: CertificateStatus;
  attempts: number;
  nextAttemptAt?: Timestamp | null;
  lastAttemptAt?: Timestamp | null;
  lastError?: string | null;
  /** Manual certificates carry their own event data. */
  content?: CertificateSettings | null;
  /** What was actually printed, recorded when the email left. */
  sentContent?: (CertificateSettings & { name: string }) | null;
  sentAt?: Timestamp | null;
  queuedAt?: Timestamp | null;
  queuedBy?: string | null;
  resendCount?: number;
  submissionId?: string | null;
  createdAt?: Timestamp;
  createdBy?: string;
  updatedAt?: Timestamp;
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

/** Volunteers and speakers are one per email; attendees one per ticket. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deterministic id for an event certificate, so a double click, a stale
 * tab or a resend lands on the same document instead of a second email.
 * Hashed because `validateParamId` caps ids at 100 characters and a slug
 * alone may use all of them.
 */
export function eventCertificateId(
  slug: string,
  kind: CertificateKind,
  key: string
): string {
  return hash(`${slug}|${kind}|${key}`);
}

export function attendeeCertificateId(slug: string, rosterId: string): string {
  return eventCertificateId(slug, "attendee", `roster:${rosterId}`);
}

export function personCertificateId(
  slug: string,
  kind: CertificateKind,
  email: string
): string {
  return eventCertificateId(slug, kind, `email:${normalizeEmail(email)}`);
}

/** Idempotent per submission: resubmitting the same form creates nothing new. */
export function manualCertificateId(
  submissionId: string,
  index: number
): string {
  return hash(`manual|${submissionId}|${index}`);
}

export type CheckinSource = "panel" | "bevy" | "both";

/**
 * How an attendee's attendance is proven: our own check-in panel, the
 * Bevy check-in imported from its CSV, or both. Null means no check-in,
 * which means no certificate.
 */
export function checkinSource(row: {
  checkedIn?: unknown;
  bevyCheckinAt?: unknown;
}): CheckinSource | null {
  const panel = row.checkedIn === true;
  const bevy =
    row.bevyCheckinAt !== null &&
    row.bevyCheckinAt !== undefined &&
    row.bevyCheckinAt !== "";
  if (panel && bevy) return "both";
  if (panel) return "panel";
  if (bevy) return "bevy";
  return null;
}
