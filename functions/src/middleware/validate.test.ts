import { describe, expect, it } from "vitest";
import { validateUrl, validateMapEmbedUrl } from "./validate";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

describe("safeId regex", () => {
  it("accepts typical event slugs", () => {
    expect(SAFE_ID_PATTERN.test("devfest-2025")).toBe(true);
    expect(SAFE_ID_PATTERN.test("build-with-ai-ica-2026")).toBe(true);
    expect(SAFE_ID_PATTERN.test("a")).toBe(true);
    expect(SAFE_ID_PATTERN.test("ABC_123")).toBe(true);
  });

  it("rejects ids with disallowed characters or length", () => {
    expect(SAFE_ID_PATTERN.test("")).toBe(false);
    expect(SAFE_ID_PATTERN.test("../etc/passwd")).toBe(false);
    expect(SAFE_ID_PATTERN.test("a b")).toBe(false);
    expect(SAFE_ID_PATTERN.test("a.b")).toBe(false);
    expect(SAFE_ID_PATTERN.test("a/b")).toBe(false);
    expect(SAFE_ID_PATTERN.test("a".repeat(101))).toBe(false);
  });
});

describe("validateUrl", () => {
  it("accepts empty/null as valid (optional fields)", () => {
    expect(validateUrl(null)).toBe(true);
    expect(validateUrl(undefined)).toBe(true);
    expect(validateUrl("")).toBe(true);
  });

  it("accepts http and https URLs", () => {
    expect(validateUrl("https://gdgica.com")).toBe(true);
    expect(validateUrl("http://localhost:4321")).toBe(true);
  });

  it("rejects javascript: and data: schemes", () => {
    expect(validateUrl("javascript:alert(1)")).toBe(false);
    expect(validateUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(validateUrl("not-a-url")).toBe(false);
  });
});

describe("validateMapEmbedUrl", () => {
  it("accepts only Google Maps https URLs under /maps/", () => {
    expect(
      validateMapEmbedUrl("https://www.google.com/maps/embed?pb=xyz")
    ).toBe(true);
    expect(
      validateMapEmbedUrl("https://maps.google.com/maps/embed?pb=xyz")
    ).toBe(true);
  });

  it("rejects non-google hosts and non-/maps/ paths", () => {
    expect(validateMapEmbedUrl("https://evil.com/maps/embed")).toBe(false);
    expect(validateMapEmbedUrl("https://www.google.com/search?q=evil")).toBe(
      false
    );
    expect(validateMapEmbedUrl("http://www.google.com/maps/embed")).toBe(false);
  });
});
