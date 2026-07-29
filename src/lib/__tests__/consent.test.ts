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

  it("points at the real GDG documents, not a placeholder", () => {
    // These are what the attendee accepts. Pointing them at a stand-in
    // means storing a consent against the wrong document, which makes the
    // whole consentAt / consentPolicyVersion record worthless as evidence.
    expect(CONSENT_LINKS.gdgEventTerms).toBe(
      "https://gdg.community.dev/participation-terms/"
    );
    expect(CONSENT_LINKS.codeOfConduct).toBe(
      "https://www.google.com/events/policy/anti-harassmentpolicy.html"
    );
  });

  it("does not reuse one URL for two different consents", () => {
    // They were briefly the same placeholder. Two checkboxes linking to
    // one document reads as a copy-paste slip and weakens both.
    expect(CONSENT_LINKS.gdgEventTerms).not.toBe(CONSENT_LINKS.codeOfConduct);
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
  it("is a real address the policy can point at", () => {
    expect(CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("matches the address the terms page already publishes", () => {
    // The policy and the terms must not send ARCO requests to two
    // different inboxes; one of them would go unread.
    expect(CONTACT_EMAIL).toBe("aalvaropc@gmail.com");
  });
});
