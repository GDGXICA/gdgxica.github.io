// Matching between self-declared credentials and the Bevy roster.
//
// Kept pure and separate from the handler so the rules that decide who is
// the same person can be tested without an emulator. Nothing here touches
// Firestore.
//
// The two collections describe different things and must not be merged:
// `roster` is imported from Bevy and authoritative about who is
// registered; `credentials` is self-declared and pre-registration. This
// module only says which rows refer to the same human.

/** Lowercased and trimmed. The only key we match on. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface ReconcileCredential {
  id: string;
  email: string;
  dni: string;
  dniNormalized: string;
  bevyStatus: string;
}

export interface ReconcileAttendee {
  id: string;
  email: string;
  ticketNumber: string;
}

export interface ReconcileMatch {
  credentialId: string;
  attendeeId: string;
  ticketNumber: string;
  dni: string;
  dniNormalized: string;
}

export interface ReconcileResult {
  matches: ReconcileMatch[];
  /** Credentials with no roster row: not registered on the official panel. */
  unmatchedCredentialIds: string[];
  /** Roster rows with no credential: registered without using our form. */
  unmatchedAttendeeIds: string[];
  /**
   * Emails appearing on more than one credential.
   *
   * Left unmatched on purpose. Two credentials sharing an address usually
   * means someone registered a relative from their own inbox, and guessing
   * which of the two DNIs belongs on the roster row would stamp an
   * identity document onto the wrong person — a worse outcome than leaving
   * it for a human.
   */
  ambiguousEmails: string[];
}

/**
 * Pairs credentials with roster rows by email.
 *
 * Email is the only key both sides carry: Bevy never sees the DNI, and the
 * credential has no ticket number until this runs. Matching on names was
 * considered and rejected — `nameMatch` exists for a search box, where a
 * near miss costs a retry, not for deciding whose identity document goes
 * on which row.
 *
 * Idempotent: a credential already `loaded` is skipped, so re-running
 * after a fresh Bevy import only touches what is genuinely new.
 */
export function reconcile(
  credentials: readonly ReconcileCredential[],
  attendees: readonly ReconcileAttendee[]
): ReconcileResult {
  const byEmail = new Map<string, ReconcileCredential[]>();
  for (const credential of credentials) {
    const key = normalizeEmail(credential.email);
    if (!key) continue;
    const bucket = byEmail.get(key);
    if (bucket) bucket.push(credential);
    else byEmail.set(key, [credential]);
  }

  const ambiguousEmails = [...byEmail.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([email]) => email);
  const ambiguous = new Set(ambiguousEmails);

  const matches: ReconcileMatch[] = [];
  const matchedCredentialIds = new Set<string>();
  const matchedAttendeeIds = new Set<string>();

  for (const attendee of attendees) {
    const key = normalizeEmail(attendee.email);
    if (!key || ambiguous.has(key)) continue;

    const credential = byEmail.get(key)?.[0];
    if (!credential) continue;

    matchedAttendeeIds.add(attendee.id);

    // Already reconciled on a previous run. Counted as matched so it does
    // not show up as "missing from Bevy", but not rewritten.
    if (credential.bevyStatus === "loaded") continue;

    matchedCredentialIds.add(credential.id);
    matches.push({
      credentialId: credential.id,
      attendeeId: attendee.id,
      ticketNumber: attendee.ticketNumber,
      dni: credential.dni,
      dniNormalized: credential.dniNormalized,
    });
  }

  return {
    matches,
    unmatchedCredentialIds: credentials
      .filter(
        (c) =>
          c.bevyStatus !== "loaded" &&
          !matchedCredentialIds.has(c.id) &&
          !ambiguous.has(normalizeEmail(c.email))
      )
      .map((c) => c.id),
    unmatchedAttendeeIds: attendees
      .filter((a) => !matchedAttendeeIds.has(a.id))
      .map((a) => a.id),
    ambiguousEmails,
  };
}
