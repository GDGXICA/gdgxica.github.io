import { describe, expect, it } from "vitest";
import { reminderRecipients } from "../ReminderButton";
import type { Credential } from "../types";

function credential(over: Partial<Credential> = {}): Credential {
  return {
    id: "c1",
    dni: "12345678",
    dniNormalized: "12345678",
    firstName: "Alvaro",
    lastName: "Pena",
    email: "alvaro@example.com",
    company: "",
    githubUsername: null,
    heardAbout: "redes_sociales",
    heardAboutOther: "",
    yearsExperience: "3_5",
    googleToolsLevel: "intermedia",
    sequenceNumber: 1,
    groupLetter: "A",
    avatarKind: "mascot",
    mascotId: "gdg-blue-a",
    photoStatus: "none",
    photoPath: null,
    credentialImagePath: null,
    photoUploadedAt: null,
    emailStatus: "sent",
    emailAttempts: 1,
    emailLastError: null,
    emailSentAt: null,
    bevyStatus: "pending",
    bevyTicketNumber: null,
    bevyNote: null,
    bevyLoadedAt: null,
    createdAt: null,
    ...over,
  };
}

describe("reminderRecipients", () => {
  it("includes someone still missing from the official panel", () => {
    const r = reminderRecipients([credential()]);
    expect(r).toHaveLength(1);
  });

  it("excludes anyone already loaded", () => {
    // The whole point of the preview: telling someone they are not
    // registered when they are costs more trust than saying nothing.
    for (const bevyStatus of ["loaded", "not_found", "discarded"] as const) {
      expect(reminderRecipients([credential({ bevyStatus })])).toHaveLength(0);
    }
  });

  it("excludes anyone we never reached in the first place", () => {
    // If the credential email never went out, the problem is the send, not
    // the registration — that belongs to the retry button.
    for (const emailStatus of ["queued", "sending", "failed"] as const) {
      expect(reminderRecipients([credential({ emailStatus })])).toHaveLength(0);
    }
  });

  it("orders by sequence so the list matches the queue on screen", () => {
    const r = reminderRecipients([
      credential({ id: "c", sequenceNumber: 3 }),
      credential({ id: "a", sequenceNumber: 1 }),
      credential({ id: "b", sequenceNumber: 2 }),
    ]);
    expect(r.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for an empty list", () => {
    expect(reminderRecipients([])).toHaveLength(0);
  });
});
