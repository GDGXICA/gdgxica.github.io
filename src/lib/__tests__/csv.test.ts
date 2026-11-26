import { describe, expect, it } from "vitest";
import { detectDelimiter, tokenizeCsv } from "../csv";

describe("detectDelimiter", () => {
  it("picks the delimiter of the first line", () => {
    expect(detectDelimiter("a,b,c\n1;2;3")).toBe(",");
    expect(detectDelimiter("nombre;correo\nAna;a@x.com")).toBe(";");
    expect(detectDelimiter("nombre\tcorreo")).toBe("\t");
  });

  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('"Torres, Ana";a@x.com')).toBe(";");
  });

  it("defaults to a comma", () => {
    expect(detectDelimiter("solo una columna")).toBe(",");
  });
});

describe("tokenizeCsv", () => {
  it("splits on the given delimiter and keeps it inside quotes", () => {
    expect(tokenizeCsv('a;"b;c"\n1;2', ";")).toEqual([
      ["a", "b;c"],
      ["1", "2"],
    ]);
  });
});
