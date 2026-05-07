import { describe, expect, it } from "vitest";
import { generateBingoCard } from "./bingo";

const TERMS_25 = Array.from({ length: 25 }, (_, i) => `term-${i + 1}`);

describe("generateBingoCard", () => {
  it("returns exactly 16 terms", () => {
    const card = generateBingoCard(TERMS_25, "user-1:instance-A");
    expect(card).toHaveLength(16);
  });

  it("contains only terms from the bank, with no duplicates", () => {
    const card = generateBingoCard(TERMS_25, "abc");
    const set = new Set(card);
    expect(set.size).toBe(16);
    for (const term of card) {
      expect(TERMS_25).toContain(term);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateBingoCard(TERMS_25, "seed-x");
    const b = generateBingoCard(TERMS_25, "seed-x");
    expect(a).toEqual(b);
  });

  it("produces different cards for different seeds (statistically)", () => {
    const a = generateBingoCard(TERMS_25, "seed-1");
    const b = generateBingoCard(TERMS_25, "seed-2");
    // It is theoretically possible (probability ~1/C(25,16)) that two
    // shuffles yield the same first-16. With these specific seeds we know
    // they don't, but assert "not equal" since that is the user-visible
    // property we care about.
    expect(a).not.toEqual(b);
  });

  it("dedupes the input bank before sampling", () => {
    const sloppy = [
      ...TERMS_25,
      ...TERMS_25.slice(0, 5), // duplicates
      "  term-1  ", // whitespace-padded duplicate
    ];
    const card = generateBingoCard(sloppy, "seed");
    expect(card).toHaveLength(16);
    expect(new Set(card).size).toBe(16);
  });

  it("throws if dedup yields fewer than 16 terms", () => {
    const tooFew = ["a", "b", "c", "a", "b", "c"];
    expect(() => generateBingoCard(tooFew, "seed")).toThrowError(
      /at least 16/i
    );
  });

  it("ignores empty/whitespace-only terms when counting", () => {
    const withGarbage = [...TERMS_25.slice(0, 16), "", "   ", "\t"];
    const card = generateBingoCard(withGarbage, "seed");
    expect(card).toHaveLength(16);
    expect(card).not.toContain("");
  });
});
