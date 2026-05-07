import { describe, expect, it } from "vitest";
import { isCleanWord, normalizeWord, WORD_MAX_LENGTH } from "../wordcloud";

describe("normalizeWord", () => {
  it("lowercases", () => {
    expect(normalizeWord("HOLA")).toBe("hola");
  });

  it("strips diacritics", () => {
    expect(normalizeWord("Coñito")).toBe("conito");
    expect(normalizeWord("ÁÉÍÓÚ")).toBe("aeiou");
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeWord("   Hola   Mundo   ")).toBe("hola mundo");
  });

  it("strips most punctuation but keeps single spaces", () => {
    expect(normalizeWord("Hola, mundo!!!")).toBe("hola mundo");
    expect(normalizeWord("buena-vibra")).toBe("buena vibra");
  });

  it("returns empty for whitespace/punctuation-only input", () => {
    expect(normalizeWord("   ")).toBe("");
    expect(normalizeWord("!!!")).toBe("");
    expect(normalizeWord("")).toBe("");
  });

  it("truncates to max length", () => {
    const long = "a".repeat(WORD_MAX_LENGTH + 20);
    expect(normalizeWord(long)).toHaveLength(WORD_MAX_LENGTH);
  });

  it("treats different casings as the same canonical id", () => {
    expect(normalizeWord("Hola")).toBe(normalizeWord("HOLA"));
    expect(normalizeWord("Hola")).toBe(normalizeWord("hola "));
    expect(normalizeWord("Hola")).toBe(normalizeWord(" hOlA  "));
  });
});

describe("isCleanWord", () => {
  it("accepts ordinary words", () => {
    expect(isCleanWord("hola")).toBe(true);
    expect(isCleanWord("Aprender")).toBe(true);
    expect(isCleanWord("Build with AI")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isCleanWord("")).toBe(false);
    expect(isCleanWord("   ")).toBe(false);
  });

  it("rejects denylisted terms regardless of case", () => {
    expect(isCleanWord("FUCK")).toBe(false);
    expect(isCleanWord("Mierda con queso")).toBe(false);
  });

  it("rejects bypasses with whitespace/punctuation", () => {
    expect(isCleanWord("p.u.t.a")).toBe(false);
    expect(isCleanWord("f u c k")).toBe(false);
  });

  it("does not flag innocuous substrings", () => {
    expect(isCleanWord("Catarina")).toBe(true);
    expect(isCleanWord("Pedro")).toBe(true);
  });
});
