import { describe, expect, it } from "vitest";
import { maskDni, normalizeDni } from "../maskDni";

// These two functions are duplicated from
// functions/src/services/credentialSearch.ts because that module ships in
// the Cloud Function bundle, not the browser one. The duplication is
// deliberate and the behaviour is pinned here; the same pattern (and the
// same reason) applies to the tokenizer shared with CheckinPanel.tsx.

describe("normalizeDni", () => {
  it("keeps only digits", () => {
    expect(normalizeDni("1234 5678")).toBe("12345678");
    expect(normalizeDni("12.345.678")).toBe("12345678");
  });

  it("groups formatting variants of the same number", () => {
    // Duplicates are never blocked on write, so a conflict that hides
    // behind a space is a conflict nobody sees.
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

  it("does not over-mask a short or empty value", () => {
    expect(maskDni("5678")).toBe("5678");
    expect(maskDni("")).toBe("");
  });

  it("never leaks a middle digit", () => {
    const masked = maskDni("98765432");
    expect(masked.slice(0, 4)).toBe("****");
    expect(masked).not.toContain("9876");
  });
});
