import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_MURAL_PHOTO_BYTES, MAX_POST_IMAGE_BYTES } from "./imageLimits";

const CLIENT_MIRROR = fileURLToPath(
  new URL("../../../src/lib/imageLimits.ts", import.meta.url)
);

function readClientConstants(source: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /export const (\w+)\s*=\s*([\d_\s*]+);/g;
  for (const [, name, expr] of source.matchAll(re)) {
    out[name] = expr
      .split("*")
      .map((part) => Number(part.trim().replace(/_/g, "")))
      .reduce((a, b) => a * b, 1);
  }
  return out;
}

describe("sincronía con el espejo de cliente", () => {
  const client = readClientConstants(readFileSync(CLIENT_MIRROR, "utf8"));

  it("el espejo declara exactamente los mismos topes", () => {
    expect(Object.keys(client).sort()).toEqual([
      "MAX_MURAL_PHOTO_BYTES",
      "MAX_POST_IMAGE_BYTES",
    ]);
  });

  it("los topes de post coinciden", () => {
    expect(client.MAX_POST_IMAGE_BYTES).toBe(MAX_POST_IMAGE_BYTES);
  });

  it("los topes del mural coinciden", () => {
    expect(client.MAX_MURAL_PHOTO_BYTES).toBe(MAX_MURAL_PHOTO_BYTES);
  });
});

describe("topes", () => {
  it("el del mural es más bajo que el de los posts", () => {
    expect(MAX_MURAL_PHOTO_BYTES).toBeLessThan(MAX_POST_IMAGE_BYTES);
  });

  it("caben en el límite de cuerpo de Express (1 MB) tras inflar a base64", () => {
    for (const bytes of [MAX_POST_IMAGE_BYTES, MAX_MURAL_PHOTO_BYTES]) {
      expect(Math.ceil((bytes * 4) / 3)).toBeLessThan(1024 * 1024);
    }
  });
});
