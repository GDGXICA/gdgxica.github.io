import { describe, expect, it } from "vitest";
import { letterForSequence, mascotForCredentialId } from "./credentialSequence";

const LETTERS = ["A", "Q", "I", "C"];

describe("letterForSequence", () => {
  it("assigns round-robin starting at the first letter", () => {
    const assigned = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      letterForSequence(n, LETTERS)
    );
    expect(assigned).toEqual(["A", "Q", "I", "C", "A", "Q", "I", "C"]);
  });

  it("keeps groups balanced at every prefix, not just at the end", () => {
    // This is the property that motivated round-robin over random: with
    // ~300 registrations and only some fraction showing up, the groups
    // have to be even for any prefix of the sequence.
    for (const total of [7, 13, 50, 137, 300]) {
      const counts = new Map<string, number>();
      for (let n = 1; n <= total; n++) {
        const letter = letterForSequence(n, LETTERS);
        counts.set(letter, (counts.get(letter) ?? 0) + 1);
      }
      const sizes = [...counts.values()];
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("is stable for the same input", () => {
    expect(letterForSequence(42, LETTERS)).toBe(letterForSequence(42, LETTERS));
  });

  it("returns A instead of throwing on an empty letter set", () => {
    // A misconfigured event must not be able to reject a registration.
    expect(letterForSequence(1, [])).toBe("A");
    expect(letterForSequence(99, [])).toBe("A");
  });

  it("handles a single-letter set", () => {
    expect(letterForSequence(1, ["Z"])).toBe("Z");
    expect(letterForSequence(500, ["Z"])).toBe("Z");
  });

  it("never indexes off the front for a non-positive sequence", () => {
    // Should be unreachable, but a negative modulus in JS is negative and
    // would return undefined rather than a letter.
    expect(LETTERS).toContain(letterForSequence(0, LETTERS));
    expect(LETTERS).toContain(letterForSequence(-3, LETTERS));
  });
});

describe("mascotForCredentialId", () => {
  const MASCOTS = ["gdg-blue-1", "gdg-red-1", "gdg-yellow-1", "gdg-green-1"];

  it("is deterministic for the same id", () => {
    expect(mascotForCredentialId("abc123", MASCOTS)).toBe(
      mascotForCredentialId("abc123", MASCOTS)
    );
  });

  it("always returns a member of the set", () => {
    for (const id of ["a", "zzzzz", "Xk29fLp0", "0000000000000000000"]) {
      expect(MASCOTS).toContain(mascotForCredentialId(id, MASCOTS));
    }
  });

  it("spreads across the set rather than collapsing to one", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `cred${i}`);
    const used = new Set(ids.map((id) => mascotForCredentialId(id, MASCOTS)));
    expect(used.size).toBe(MASCOTS.length);
  });

  it("returns null when there are no mascots", () => {
    expect(mascotForCredentialId("abc", [])).toBeNull();
  });
});
