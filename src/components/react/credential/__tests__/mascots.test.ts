import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
    // Read off the declared brandColor rather than sniffed out of the id.
    // The ids used to encode the colour, which stopped being true the
    // moment a mascot was called "gopher" — and an id-substring check
    // would have passed happily on a set that had lost a whole colour.
    for (const color of ["blue", "red", "yellow", "green"]) {
      expect(MASCOTS.some((m) => m.brandColor === color)).toBe(true);
    }
  });

  it("pre-selects an avatar that actually exists", () => {
    // DEFAULT_MASCOT_ID is a literal now, not MASCOTS[0], so nothing but
    // this test stops it drifting out of the set and rendering initials.
    expect(MASCOT_IDS).toContain(DEFAULT_MASCOT_ID);
  });
});

describe("findMascot", () => {
  it("resolves a known id", () => {
    expect(findMascot(DEFAULT_MASCOT_ID)?.id).toBe(DEFAULT_MASCOT_ID);
  });

  it("returns null for an unknown or absent id", () => {
    // "gdg-blue-b" was a real id until the mascot set was replaced, so it
    // doubles as the stored-but-retired case: it must resolve to null
    // rather than to whatever now sits at that position.
    expect(findMascot("gdg-blue-b")).toBeNull();
    expect(findMascot("no-existe")).toBeNull();
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

  // The agreement with the server-side picker is NOT tested here. It cannot
  // be: this bundle cannot import Functions. It now lives in
  // functions/src/services/credentialSequence.test.ts, which imports both
  // sides and pins the list, its order and the hash itself.
});

describe("los ficheros del manifiesto", () => {
  // Nothing validated the assets themselves, so a manifest entry pointing
  // at a missing or wrongly-sized file failed silently: findMascot returns
  // the entry, the <img> 404s, and the card falls back to grey initials
  // with every test still green.
  const PUBLIC_DIR = join(process.cwd(), "public");

  // Eight of these load at once in the picker. Tux is the heaviest of the
  // real illustrations at ~62 KB; 80 KB leaves room to re-cut the art
  // without silently letting a multi-hundred-KB export through.
  const MAX_BYTES = 80 * 1024;

  it.each(MASCOTS.map((m) => [m.id, m.src] as const))(
    "%s es un PNG 512x512 RGBA dentro del presupuesto",
    (_id, src) => {
      const file = join(PUBLIC_DIR, src);
      expect(existsSync(file)).toBe(true);

      const buf = readFileSync(file);
      expect(buf.byteLength).toBeLessThanOrEqual(MAX_BYTES);

      // Read straight out of the IHDR chunk, which PNG fixes at bytes 8-24:
      // width and height are big-endian uint32 at 16 and 20, and byte 25 is
      // the colour type, where 6 means truecolour with alpha. Cheaper and
      // more precise than pulling in an image library.
      expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(buf.readUInt32BE(16)).toBe(512);
      expect(buf.readUInt32BE(20)).toBe(512);
      expect(buf[25]).toBe(6);
    }
  );

  it("no deja ficheros huérfanos en el directorio", () => {
    // A retired mascot whose PNG stayed behind is dead weight in the
    // deploy and an invitation to re-add a half-removed entry.
    const onDisk = readdirSync(join(PUBLIC_DIR, "credencial/mascots")).filter(
      (f) => f.endsWith(".png")
    );
    expect(onDisk.sort()).toEqual(
      MASCOTS.map((m) => m.src.split("/").pop()!).sort()
    );
  });
});
