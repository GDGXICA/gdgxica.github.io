import { describe, expect, it } from "vitest";
import {
  CONSENT_IDS,
  CONSENT_ITEMS,
  CONSENT_LINKS,
  CONTACT_EMAIL,
  missingConsentMessage,
  PRIVACY_POLICY_VERSION,
} from "../consent";

describe("PRIVACY_POLICY_VERSION", () => {
  it("is a plain ISO date, the form the server enum stores", () => {
    // functions/src/schemas/credentials.ts pins the accepted versions in
    // KNOWN_POLICY_VERSIONS. Bumping this constant without adding the new
    // value there rejects every submission, so keep the format identical.
    expect(PRIVACY_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("CONSENT_ITEMS", () => {
  it("collects exactly the five consents the credential document stores", () => {
    expect(CONSENT_IDS).toEqual([
      "consentGdgTerms",
      "consentGooglePrivacy",
      "consentCodeOfConduct",
      "consentDataProcessing",
      "consentAgeAttested",
    ]);
  });

  it("has no duplicate ids", () => {
    expect(new Set(CONSENT_IDS).size).toBe(CONSENT_ITEMS.length);
  });

  it("gives every item readable copy", () => {
    for (const item of CONSENT_ITEMS) {
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("pairs every link label with an href and vice versa", () => {
    for (const item of CONSENT_ITEMS) {
      expect(Boolean(item.linkLabel)).toBe(Boolean(item.href));
    }
  });

  it("includes an age attestation", () => {
    // DevFest attendees include students, and Ley 29733 constrains minors.
    // This is the minimum defensible position.
    const age = CONSENT_ITEMS.find((c) => c.id === "consentAgeAttested");
    expect(age?.label).toMatch(/apoderado/i);
  });
});

describe("CONSENT_LINKS", () => {
  it("points the GDG Ica consent at our own policy page", () => {
    expect(CONSENT_LINKS.gdgIcaPrivacy).toBe("/privacy-policy");
  });

  it("uses absolute https URLs for third-party documents", () => {
    for (const key of [
      "gdgEventTerms",
      "googlePrivacy",
      "codeOfConduct",
    ] as const) {
      expect(CONSENT_LINKS[key].startsWith("https://")).toBe(true);
    }
  });
});

describe("missingConsentMessage", () => {
  it("names the consent that is missing", () => {
    // A z.literal(true) failure the attendee cannot trace back to a
    // specific checkbox is a dead end.
    expect(missingConsentMessage("consentCodeOfConduct")).toContain(
      "Código de Conducta"
    );
  });

  it("falls back to generic copy for an unknown id", () => {
    expect(missingConsentMessage("consentSomethingElse")).toBe(
      "Falta aceptar una de las condiciones"
    );
  });
});

describe("CONTACT_EMAIL", () => {
  it("is a GDG Ica address, not a personal one", () => {
    // The policy promises a 20-working-day response under Ley 29733; that
    // has to reach the organising team, not one person's inbox.
    expect(CONTACT_EMAIL).toMatch(/@gdgica\.com$/);
  });
});
