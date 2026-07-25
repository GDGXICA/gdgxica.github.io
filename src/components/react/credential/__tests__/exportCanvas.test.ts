import { describe, expect, it, vi } from "vitest";
import {
  dataUrlByteLength,
  encodeUnderBudget,
  MAX_PREVIEW_DPR,
  QUALITY_LADDER,
} from "../exportCanvas";

/**
 * A canvas whose toDataURL length shrinks as quality drops, so the ladder
 * in encodeUnderBudget is genuinely exercised. jsdom's real toDataURL
 * returns a fixed stub regardless of quality.
 */
function fakeCanvas(lengthByQuality: Record<number, number>) {
  const toDataURL = vi.fn((_type: string, quality: number) => {
    const len = lengthByQuality[quality] ?? 100;
    // A well-formed data URL of the requested total length.
    const prefix = "data:image/jpeg;base64,";
    return prefix + "A".repeat(Math.max(0, len - prefix.length));
  });
  return { canvas: { toDataURL } as unknown as HTMLCanvasElement, toDataURL };
}

describe("dataUrlByteLength", () => {
  it("matches atob for an unpadded payload", () => {
    const dataUrl = "data:image/jpeg;base64,QUJDRA==";
    expect(dataUrlByteLength(dataUrl)).toBe(atob("QUJDRA==").length);
  });

  it("matches atob across padding variants", () => {
    for (const raw of ["QQ==", "QUI=", "QUJD", "QUJDRA==", "QUJDREU="]) {
      expect(dataUrlByteLength(`data:image/jpeg;base64,${raw}`)).toBe(
        atob(raw).length
      );
    }
  });

  it("returns 0 for a string with no comma", () => {
    expect(dataUrlByteLength("not-a-data-url")).toBe(0);
  });

  it("returns 0 for an empty payload", () => {
    expect(dataUrlByteLength("data:image/jpeg;base64,")).toBe(0);
  });
});

describe("encodeUnderBudget", () => {
  it("returns the highest quality that fits", () => {
    const { canvas, toDataURL } = fakeCanvas({ 0.9: 500, 0.82: 300 });
    const r = encodeUnderBudget(canvas, 1000);
    expect(r?.quality).toBe(0.9);
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it("steps down until the payload fits the budget", () => {
    const { canvas } = fakeCanvas({
      0.9: 5000,
      0.82: 3000,
      0.72: 900,
      0.6: 400,
    });
    const r = encodeUnderBudget(canvas, 1000);
    expect(r?.quality).toBe(0.72);
    expect(r?.chars).toBe(900);
  });

  it("returns null when even the lowest quality overflows", () => {
    const { canvas } = fakeCanvas({
      0.9: 9000,
      0.82: 8000,
      0.72: 7000,
      0.6: 6000,
    });
    // Returning null lets the caller fall back instead of POSTing
    // something the server's Zod length cap will reject with a 400.
    expect(encodeUnderBudget(canvas, 1000)).toBeNull();
  });

  it("budgets on characters, matching the unit the server validates", () => {
    const { canvas } = fakeCanvas({ 0.9: 1000 });
    const r = encodeUnderBudget(canvas, 1000);
    expect(r?.chars).toBe(1000);
    // Bytes are reported too, but they are strictly smaller and are not
    // what the cap is measured against.
    expect(r!.bytes).toBeLessThan(r!.chars);
  });

  it("tries the ladder in descending quality order", () => {
    const { canvas, toDataURL } = fakeCanvas({});
    encodeUnderBudget(canvas, 0);
    const used = toDataURL.mock.calls.map((c) => c[1]);
    expect(used).toEqual([...QUALITY_LADDER]);
  });
});

describe("preview scaling", () => {
  it("caps the device pixel ratio at 2", () => {
    // An uncapped 3x phone would back a 360px preview with a 3240px
    // canvas and redraw it on every keystroke.
    expect(MAX_PREVIEW_DPR).toBe(2);
  });
});
