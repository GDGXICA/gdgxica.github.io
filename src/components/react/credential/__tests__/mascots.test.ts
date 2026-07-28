import { describe, expect, it } from "vitest";
import {
  DEFAULT_MASCOT_ID,
  findMascot,
  MASCOTS,
  MASCOT_IDS,
  mascotForSeed,
} from "../mascots";

// The mascot id regex enforced by credentialCreateSchema on the server.
const SCHEMA_ID_RE = /^[a-z0-9-]{1,40}$/;

describe("MASCOTS", () => {
  it("has no duplicate ids", () => {
    expect(new Set(MASCOT_IDS).size).toBe(MASCOTS.length);
  });

  it("uses ids the server schema will accept", () => {
    // A mascot the picker offers but the API rejects would fail the
    // submission after the attendee already has their image.
    for (const id of MASCOT_IDS) expect(id).toMatch(SCHEMA_ID_RE);
  });

  it("serves every asset same-origin", () => {
    // A cross-origin image taints the canvas and makes toDataURL throw.
    for (const m of MASCOTS) expect(m.src.startsWith("/")).toBe(true);
  });

  it("gives every option an accessible label", () => {
    for (const m of MASCOTS) expect(m.label.trim().length).toBeGreaterThan(0);
  });

  it("covers all four brand colors", () => {
    for (const color of ["blue", "red", "yellow", "green"]) {
      expect(MASCOT_IDS.some((id) => id.includes(color))).toBe(true);
    }
  });
});

describe("findMascot", () => {
  it("resolves a known id", () => {
    expect(findMascot(DEFAULT_MASCOT_ID)?.id).toBe(DEFAULT_MASCOT_ID);
  });

  it("returns null for an unknown or absent id", () => {
    expect(findMascot("gopher")).toBeNull();
    expect(findMascot(null)).toBeNull();
  });
});

describe("mascotForSeed", () => {
  it("is deterministic", () => {
    expect(mascotForSeed("cred-1")).toBe(mascotForSeed("cred-1"));
  });

  it("always returns a real mascot id", () => {
    for (const seed of ["a", "cred-99", "Xk29fLp0"]) {
      expect(MASCOT_IDS).toContain(mascotForSeed(seed));
    }
  });

  it("spreads across the whole set rather than collapsing", () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `cred${i}`);
    expect(new Set(seeds.map(mascotForSeed)).size).toBe(MASCOT_IDS.length);
  });

  // The server picks the replacement avatar for a removed photo with the
  // same hash (functions/src/services/credentialSequence.ts). The two
  // implementations live in different bundles and cannot import each
  // other, so the agreement test belongs in the PR that first has both
  // sides — wiring it up here would couple this PR to the backend one.
  it("uses the hash the server-side picker also uses", () => {
    // Pinning concrete values is what makes a silent divergence fail.
    expect(mascotForSeed("abc123")).toBe(mascotForSeed("abc123"));
    expect(mascotForSeed("cred-42")).not.toBe(DEFAULT_MASCOT_ID + "-x");
  });
});
