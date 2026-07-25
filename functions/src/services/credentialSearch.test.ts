import { describe, expect, it } from "vitest";
import {
  buildCredentialSearchTokens,
  maskDni,
  normalizeDni,
} from "./credentialSearch";
import { buildSearchTokens } from "./nameMatch";

describe("normalizeDni", () => {
  it("keeps only digits", () => {
    expect(normalizeDni("1234 5678")).toBe("12345678");
    expect(normalizeDni("12.345.678")).toBe("12345678");
    expect(normalizeDni("  12345678 ")).toBe("12345678");
  });

  it("groups formatting variants of the same number", () => {
    // The whole point of the key: a conflict must not hide behind a space.
    expect(normalizeDni("1234 5678")).toBe(normalizeDni("12345678"));
  });
});

describe("maskDni", () => {
  it("reveals only the last four digits", () => {
    expect(maskDni("12345678")).toBe("****5678");
  });

  it("masks based on normalized digits, not raw length", () => {
    expect(maskDni("1234 5678")).toBe("****5678");
  });

  it("does not over-mask a short value", () => {
    expect(maskDni("5678")).toBe("5678");
    expect(maskDni("")).toBe("");
  });
});

describe("buildCredentialSearchTokens", () => {
  const BASE = {
    firstName: "José",
    lastName: "Ñañez Quintanilla",
    email: "jose.nanez@example.com",
    dni: "12345678",
  };

  it("matches names typed without diacritics", () => {
    const tokens = buildCredentialSearchTokens(BASE);
    expect(tokens).toContain("jose");
    expect(tokens).toContain("nanez");
  });

  it("indexes the DNI so it can be typed into the same search box", () => {
    expect(buildCredentialSearchTokens(BASE)).toContain("12345678");
  });

  it("indexes a formatted DNI under its normalized form", () => {
    const tokens = buildCredentialSearchTokens({ ...BASE, dni: "1234 5678" });
    expect(tokens).toContain("12345678");
  });

  it("indexes the email address and its local part", () => {
    const tokens = buildCredentialSearchTokens(BASE);
    expect(tokens).toContain("jose.nanez@example.com");
    expect(tokens).toContain("jose");
  });

  it("indexes the GitHub username when present", () => {
    const tokens = buildCredentialSearchTokens({
      ...BASE,
      githubUsername: "aalvaropc",
    });
    expect(tokens).toContain("aalvaropc");
  });

  it("tolerates a missing GitHub username", () => {
    expect(() =>
      buildCredentialSearchTokens({ ...BASE, githubUsername: null })
    ).not.toThrow();
    expect(
      buildCredentialSearchTokens({ ...BASE, githubUsername: "" })
    ).toEqual(buildCredentialSearchTokens(BASE));
  });

  it("returns no duplicates", () => {
    const tokens = buildCredentialSearchTokens({
      ...BASE,
      githubUsername: "jose",
    });
    expect(tokens.length).toBe(new Set(tokens).size);
  });

  it("stays a superset of the roster tokenizer for the same person", () => {
    // Reconciliation between credentials and the Bevy roster relies on both
    // sides running through buildSearchTokens. If this diverges, a
    // credential stops being findable by a query that finds its roster row.
    const rosterTokens = buildSearchTokens({
      firstName: BASE.firstName,
      lastName: BASE.lastName,
      email: BASE.email,
      ticketNumber: BASE.dni,
    });
    const credentialTokens = buildCredentialSearchTokens(BASE);
    for (const token of rosterTokens) {
      expect(credentialTokens).toContain(token);
    }
  });
});
