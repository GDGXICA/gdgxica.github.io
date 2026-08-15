import { describe, expect, it } from "vitest";
import {
  MASCOT_IDS,
  letterForSequence,
  mascotForCredentialId,
} from "./credentialSequence";
import * as client from "../../../src/components/react/credential/mascots";

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

/**
 * The agreement test that mascots.ts has been asking for.
 *
 * The manifest exists twice on purpose — the picker renders from the client
 * copy, and Functions cannot import the browser bundle at runtime — so the
 * only thing standing between the two is this file. Until now nothing did,
 * and a divergence was completely silent: a take-down would write a mascotId
 * the client cannot resolve, and that attendee's card would quietly fall
 * back to grey initials with no test failing anywhere.
 */
describe("MASCOT_IDS — espejo cliente/servidor", () => {
  it("coincide con el manifiesto del cliente, en el mismo orden", () => {
    // Order-sensitive on purpose: mascotForCredentialId indexes by position,
    // so a reorder alone silently reassigns every replacement avatar.
    expect([...MASCOT_IDS]).toEqual([...client.MASCOT_IDS]);
  });

  it("asigna la misma mascota que el cliente para una misma semilla", () => {
    // The two hashes are written out separately, so equal lists are not
    // enough — the functions themselves have to agree.
    for (const seed of ["a", "cred-99", "Xk29fLp0", "cred-abc123", ""]) {
      expect(mascotForCredentialId(seed, MASCOT_IDS)).toBe(
        client.mascotForSeed(seed)
      );
    }
  });

  it("solo contiene ids que el esquema del servidor aceptaría", () => {
    for (const id of MASCOT_IDS) {
      expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
    }
  });
});
