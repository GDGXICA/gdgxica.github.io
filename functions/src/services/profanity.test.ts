import { describe, expect, it } from "vitest";
import { isCleanAlias } from "./profanity";

describe("isCleanAlias", () => {
  it("accepts ordinary aliases", () => {
    expect(isCleanAlias("Ana")).toBe(true);
    expect(isCleanAlias("Carlos 123")).toBe(true);
    expect(isCleanAlias("Maria_Jose")).toBe(true);
    expect(isCleanAlias("Aleksandra-Ñ")).toBe(true);
  });

  it("rejects empty / whitespace-only aliases", () => {
    expect(isCleanAlias("")).toBe(false);
    expect(isCleanAlias("   ")).toBe(false);
    expect(isCleanAlias("\t\n")).toBe(false);
  });

  it("blocks denylist terms regardless of case", () => {
    expect(isCleanAlias("FUCK")).toBe(false);
    expect(isCleanAlias("Fuck you")).toBe(false);
    expect(isCleanAlias("PUTAvida")).toBe(false);
    expect(isCleanAlias("the_bitch")).toBe(false);
  });

  it("blocks denylist terms with whitespace/punctuation bypasses", () => {
    expect(isCleanAlias("f u c k")).toBe(false);
    expect(isCleanAlias("fu_ck")).toBe(false);
    expect(isCleanAlias("p.u.t.a")).toBe(false);
    expect(isCleanAlias("m i e r d a")).toBe(false);
  });

  it("normalises accents to catch direct denylist matches", () => {
    // "coño" -> "cono"; denylist entry "coño" also normalises to "cono",
    // so the substring match catches it.
    expect(isCleanAlias("coño")).toBe(false);
    expect(isCleanAlias("CÓÑO")).toBe(false);
  });

  it("does not flag substrings that only happen to share letters", () => {
    expect(isCleanAlias("Catarina")).toBe(true);
    expect(isCleanAlias("Pedro")).toBe(true);
    // "Conchita" -> "conchita". Denylist has "concha" (ends in a), so the
    // first 6 chars "conchi" don't match — the alias passes.
    expect(isCleanAlias("Conchita")).toBe(true);
  });
});
