import { describe, expect, it } from "vitest";
import {
  credentialBevyStatusSchema,
  credentialCreateSchema,
  credentialPhotoModerationSchema,
  MAX_PHOTO_DATAURL_CHARS,
} from "./credentials";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const VALID = {
  firstName: "Alvaro",
  lastName: "Pena",
  dni: "12345678",
  email: "Alvaro@Example.com",
  company: "Shinkansen",
  githubUsername: "aalvaropc",
  heardAbout: "redes_sociales",
  heardAboutOther: "",
  yearsExperience: "3_5",
  googleToolsLevel: "intermedia",
  consentGdgTerms: true,
  consentGooglePrivacy: true,
  consentCodeOfConduct: true,
  consentDataProcessing: true,
  consentAgeAttested: true,
  consentPolicyVersion: "2026-08-01",
  avatarKind: "mascot",
  mascotId: "gdg-blue-1",
  photoDataUrl: null,
  credentialImageDataUrl: JPEG,
};

/** Returns the dotted path of the first issue, for path assertions. */
function firstIssuePath(input: unknown): string {
  const r = credentialCreateSchema.safeParse(input);
  if (r.success) throw new Error("expected a validation failure");
  return r.error.issues[0].path.join(".");
}

describe("credentialCreateSchema", () => {
  it("accepts a valid mascot submission", () => {
    expect(credentialCreateSchema.safeParse(VALID).success).toBe(true);
  });

  it("lowercases the email so it can key reconciliation", () => {
    const r = credentialCreateSchema.safeParse(VALID);
    expect(r.success && r.data.email).toBe("alvaro@example.com");
  });

  it("rejects an unknown key", () => {
    const r = credentialCreateSchema.safeParse({ ...VALID, nickname: "al" });
    expect(r.success).toBe(false);
  });

  describe("consent", () => {
    const CONSENTS = [
      "consentGdgTerms",
      "consentGooglePrivacy",
      "consentCodeOfConduct",
      "consentDataProcessing",
      "consentAgeAttested",
    ] as const;

    it.each(CONSENTS)("rejects %s when explicitly false", (key) => {
      const r = credentialCreateSchema.safeParse({ ...VALID, [key]: false });
      expect(r.success).toBe(false);
    });

    it.each(CONSENTS)("rejects %s when absent", (key) => {
      const input: Record<string, unknown> = { ...VALID };
      delete input[key];
      expect(credentialCreateSchema.safeParse(input).success).toBe(false);
    });

    it.each(CONSENTS)(
      "reports %s on its own path so the UI can map it",
      (key) => {
        // A z.literal(true) failure the client cannot trace back to a
        // specific checkbox is a dead end for the user.
        expect(firstIssuePath({ ...VALID, [key]: false })).toBe(key);
      }
    );

    it("rejects an unknown policy version", () => {
      const r = credentialCreateSchema.safeParse({
        ...VALID,
        consentPolicyVersion: "2020-01-01",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("dni", () => {
    it("accepts exactly eight digits", () => {
      expect(
        credentialCreateSchema.safeParse({ ...VALID, dni: "00000001" }).success
      ).toBe(true);
    });

    it.each(["1234567", "123456789", "1234567a", "", "12 345678"])(
      "rejects %j",
      (dni) => {
        expect(
          credentialCreateSchema.safeParse({ ...VALID, dni }).success
        ).toBe(false);
      }
    );

    it("accepts an implausible but well-formed dni", () => {
      // Flagging implausible numbers is an admin-panel policy; blocking
      // them here would reject real people over a validation guess.
      expect(
        credentialCreateSchema.safeParse({ ...VALID, dni: "00000000" }).success
      ).toBe(true);
    });
  });

  describe("githubUsername", () => {
    it.each(["a", "a-b", "aalvaropc", "a1-b2"])("accepts %j", (u) => {
      expect(
        credentialCreateSchema.safeParse({ ...VALID, githubUsername: u })
          .success
      ).toBe(true);
    });

    it.each(["-a", "a-", "a--b", "a".repeat(40), "al varo", "a@b"])(
      "rejects %j",
      (u) => {
        expect(
          credentialCreateSchema.safeParse({ ...VALID, githubUsername: u })
            .success
        ).toBe(false);
      }
    );

    it("accepts null", () => {
      expect(
        credentialCreateSchema.safeParse({ ...VALID, githubUsername: null })
          .success
      ).toBe(true);
    });
  });

  describe("images", () => {
    it("accepts a jpeg data url", () => {
      const r = credentialCreateSchema.safeParse({
        ...VALID,
        avatarKind: "photo",
        photoDataUrl: JPEG,
      });
      expect(r.success).toBe(true);
    });

    it.each([
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,iVBORw0KGgo=",
      "https://example.com/photo.jpg",
      "/9j/4AAQSkZJRg==",
    ])("rejects %j", (photoDataUrl) => {
      const r = credentialCreateSchema.safeParse({
        ...VALID,
        avatarKind: "photo",
        photoDataUrl,
      });
      expect(r.success).toBe(false);
    });

    it("rejects a photo over the payload budget", () => {
      const oversized = `data:image/jpeg;base64,${"A".repeat(
        MAX_PHOTO_DATAURL_CHARS
      )}`;
      const r = credentialCreateSchema.safeParse({
        ...VALID,
        avatarKind: "photo",
        photoDataUrl: oversized,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("cross-field rules", () => {
    it("requires a photo when avatarKind is photo", () => {
      expect(
        firstIssuePath({ ...VALID, avatarKind: "photo", photoDataUrl: null })
      ).toBe("avatarKind");
    });

    it("requires a mascot when avatarKind is mascot", () => {
      expect(firstIssuePath({ ...VALID, mascotId: null })).toBe("avatarKind");
    });

    it("requires a free-text answer when heardAbout is otro", () => {
      expect(
        firstIssuePath({ ...VALID, heardAbout: "otro", heardAboutOther: "" })
      ).toBe("heardAboutOther");
    });

    it("accepts otro with a free-text answer", () => {
      const r = credentialCreateSchema.safeParse({
        ...VALID,
        heardAbout: "otro",
        heardAboutOther: "Me lo dijo un profesor",
      });
      expect(r.success).toBe(true);
    });
  });
});

describe("credentialBevyStatusSchema", () => {
  it("accepts a load confirmation", () => {
    const r = credentialBevyStatusSchema.safeParse({
      status: "loaded",
      ticketNumber: "GOOGA263171317",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.note).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(
      credentialBevyStatusSchema.safeParse({ status: "uploaded" }).success
    ).toBe(false);
  });

  it("rejects an over-long note", () => {
    expect(
      credentialBevyStatusSchema.safeParse({
        status: "not_found",
        note: "x".repeat(301),
      }).success
    ).toBe(false);
  });
});

describe("credentialPhotoModerationSchema", () => {
  it("defaults the reason to an empty string on approve", () => {
    const r = credentialPhotoModerationSchema.safeParse({ action: "approve" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.reason).toBe("");
  });

  it("rejects an unknown action", () => {
    expect(
      credentialPhotoModerationSchema.safeParse({ action: "delete" }).success
    ).toBe(false);
  });
});
