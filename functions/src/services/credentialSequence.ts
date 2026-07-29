// Group-letter assignment for attendee credentials.
//
// Every credential gets a gapless 1-based sequence number, assigned inside
// the same Firestore transaction that creates it, and a group letter
// derived from that number. The letter drives an on-site dynamic: everyone
// holding the same letter forms a group.

/**
 * Round-robin, deliberately not random.
 *
 * With ~300 attendees and 4 letters, random assignment produces visibly
 * uneven groups; round-robin is exactly balanced at every prefix of the
 * sequence, so the groups stay even even if only a third of registrants
 * show up.
 *
 * An empty letter set returns "A" rather than throwing. This runs inside
 * the credential-creation transaction, and a misconfigured event JSON must
 * not be able to reject a registration — the loader already substitutes
 * defaults, so reaching here with an empty array means something upstream
 * is broken and a degraded letter beats a lost attendee.
 */
export function letterForSequence(
  sequenceNumber: number,
  letters: readonly string[]
): string {
  if (letters.length === 0) return "A";
  // Sequence numbers are 1-based, so shift before taking the modulus.
  const index = (Math.trunc(sequenceNumber) - 1) % letters.length;
  // A negative or zero sequence should never reach here, but modulus on a
  // negative operand is negative in JS and would index off the front.
  return letters[index < 0 ? index + letters.length : index];
}

/**
 * Distributes credentials whose photo was taken down across the mascot
 * set without another round trip. Deterministic so re-running moderation
 * on the same record cannot shuffle the avatar the attendee already saw.
 */
export function mascotForCredentialId(
  credentialId: string,
  mascotIds: readonly string[]
): string | null {
  if (mascotIds.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < credentialId.length; i++) {
    // Same cheap FNV-ish rolling hash used for bingo card seeding; we need
    // spread, not cryptographic strength.
    hash = (hash * 31 + credentialId.charCodeAt(i)) >>> 0;
  }
  return mascotIds[hash % mascotIds.length];
}
