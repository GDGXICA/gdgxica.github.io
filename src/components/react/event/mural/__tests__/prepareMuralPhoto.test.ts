import { describe, expect, it } from "vitest";
import { clientRequestIdFor } from "../prepareMuralPhoto";

function fileOf(name: string, bytes: number, lastModified: number): File {
  return new File([new Uint8Array(bytes)], name, {
    type: "image/jpeg",
    lastModified,
  });
}

describe("clientRequestIdFor", () => {
  it("el mismo archivo produce el mismo id", () => {
    const a = fileOf("IMG_0042.jpg", 120, 1_700_000_000_000);
    const b = fileOf("IMG_0042.jpg", 120, 1_700_000_000_000);
    expect(clientRequestIdFor(a)).toBe(clientRequestIdFor(b));
  });

  it("archivos distintos producen ids distintos", () => {
    const base = fileOf("IMG_0042.jpg", 120, 1_700_000_000_000);
    const otherName = fileOf("IMG_0043.jpg", 120, 1_700_000_000_000);
    const otherSize = fileOf("IMG_0042.jpg", 121, 1_700_000_000_000);
    const otherDate = fileOf("IMG_0042.jpg", 120, 1_700_000_000_001);

    const id = clientRequestIdFor(base);
    expect(clientRequestIdFor(otherName)).not.toBe(id);
    expect(clientRequestIdFor(otherSize)).not.toBe(id);
    expect(clientRequestIdFor(otherDate)).not.toBe(id);
  });

  it("cumple el formato que exige el esquema del servidor", () => {
    const pattern = /^[a-zA-Z0-9_-]{8,64}$/;
    for (const name of ["a.jpg", "foto con espacios.JPEG", "ñandú-1.jpg", ""]) {
      expect(clientRequestIdFor(fileOf(name, 10, 1))).toMatch(pattern);
    }
  });

  it("es estable entre llamadas, no aleatorio", () => {
    const file = fileOf("IMG_0042.jpg", 120, 1_700_000_000_000);
    const ids = new Set([
      clientRequestIdFor(file),
      clientRequestIdFor(file),
      clientRequestIdFor(file),
    ]);
    expect(ids.size).toBe(1);
  });
});
