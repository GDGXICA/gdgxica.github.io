import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  reconcile,
  type ReconcileAttendee,
  type ReconcileCredential,
} from "./credentialReconcile";

function credential(
  over: Partial<ReconcileCredential> = {}
): ReconcileCredential {
  return {
    id: "c1",
    email: "alvaro@example.com",
    dni: "12345678",
    dniNormalized: "12345678",
    bevyStatus: "pending",
    ...over,
  };
}

function attendee(over: Partial<ReconcileAttendee> = {}): ReconcileAttendee {
  return {
    id: "t_GOOGA1",
    email: "alvaro@example.com",
    ticketNumber: "GOOGA1",
    ...over,
  };
}

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Alvaro@Example.COM ")).toBe("alvaro@example.com");
  });
});

describe("reconcile", () => {
  it("pairs a credential with its roster row", () => {
    const r = reconcile([credential()], [attendee()]);
    expect(r.matches).toEqual([
      {
        credentialId: "c1",
        attendeeId: "t_GOOGA1",
        ticketNumber: "GOOGA1",
        dni: "12345678",
        dniNormalized: "12345678",
      },
    ]);
    expect(r.unmatchedCredentialIds).toHaveLength(0);
    expect(r.unmatchedAttendeeIds).toHaveLength(0);
  });

  it("matches regardless of case and surrounding spaces", () => {
    // Bevy exports and hand-typed forms disagree on both constantly.
    const r = reconcile(
      [credential({ email: "Alvaro@Example.com" })],
      [attendee({ email: "  alvaro@EXAMPLE.com " })]
    );
    expect(r.matches).toHaveLength(1);
  });

  it("reports a credential with no roster row as unmatched", () => {
    // This is the population the reminder targets: they filled our form
    // and never finished on the official panel.
    const r = reconcile([credential()], []);
    expect(r.unmatchedCredentialIds).toEqual(["c1"]);
    expect(r.matches).toHaveLength(0);
  });

  it("reports a roster row with no credential as unmatched", () => {
    // Registered on Bevy without using our form. Nothing to fix, but the
    // panel should not claim we have their DNI.
    const r = reconcile([], [attendee()]);
    expect(r.unmatchedAttendeeIds).toEqual(["t_GOOGA1"]);
  });

  it("is idempotent: an already loaded credential is not rewritten", () => {
    // Re-running after a fresh Bevy import must only touch what is new.
    const r = reconcile([credential({ bevyStatus: "loaded" })], [attendee()]);
    expect(r.matches).toHaveLength(0);
    expect(r.unmatchedCredentialIds).toHaveLength(0);
    expect(r.unmatchedAttendeeIds).toHaveLength(0);
  });

  it("refuses to guess when two credentials share an email", () => {
    // Usually someone registering a relative from their own inbox.
    // Picking one would stamp an identity document onto the wrong person.
    const r = reconcile(
      [
        credential({ id: "c1", dni: "11111111" }),
        credential({ id: "c2", dni: "22222222" }),
      ],
      [attendee()]
    );
    expect(r.matches).toHaveLength(0);
    expect(r.ambiguousEmails).toEqual(["alvaro@example.com"]);
  });

  it("leaves an ambiguous email out of the unmatched list too", () => {
    // It is not "missing from Bevy" — it needs a human, which is a
    // different action, so mixing it in would mislead the panel.
    const r = reconcile(
      [credential({ id: "c1" }), credential({ id: "c2" })],
      [attendee()]
    );
    expect(r.unmatchedCredentialIds).toHaveLength(0);
  });

  it("still matches everyone else when one email is ambiguous", () => {
    const r = reconcile(
      [
        credential({ id: "c1" }),
        credential({ id: "c2" }),
        credential({ id: "c3", email: "otra@example.com", dni: "33333333" }),
      ],
      [
        attendee(),
        attendee({
          id: "t_GOOGA2",
          email: "otra@example.com",
          ticketNumber: "GOOGA2",
        }),
      ]
    );
    expect(r.matches.map((m) => m.credentialId)).toEqual(["c3"]);
    expect(r.ambiguousEmails).toEqual(["alvaro@example.com"]);
  });

  it("ignores rows with a blank email on either side", () => {
    const r = reconcile(
      [credential({ email: "   " })],
      [attendee({ email: "" })]
    );
    expect(r.matches).toHaveLength(0);
    expect(r.ambiguousEmails).toHaveLength(0);
  });

  it("handles both collections being empty", () => {
    const r = reconcile([], []);
    expect(r.matches).toHaveLength(0);
    expect(r.unmatchedCredentialIds).toHaveLength(0);
    expect(r.unmatchedAttendeeIds).toHaveLength(0);
  });
});
