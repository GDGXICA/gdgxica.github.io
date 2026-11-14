import { describe, expect, it } from "vitest";
import { webpSize } from "@/utils/imageSize";

function header(chunk: string, fill: (bytes: Uint8Array) => void): Uint8Array {
  const bytes = new Uint8Array(30);
  const put = (at: number, text: string) =>
    [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  put(0, "RIFF");
  put(8, "WEBP");
  put(12, chunk);
  fill(bytes);
  return bytes;
}

describe("webpSize", () => {
  it("reads an extended (VP8X) header", () => {
    // 1080 x 1120, stored minus one in 24-bit little endian
    const bytes = header("VP8X", (b) => {
      b[24] = 1079 & 0xff;
      b[25] = 1079 >> 8;
      b[27] = 1119 & 0xff;
      b[28] = 1119 >> 8;
    });
    expect(webpSize(bytes)).toEqual({ width: 1080, height: 1120 });
  });

  it("reads a lossy (VP8) header", () => {
    const bytes = header("VP8 ", (b) => {
      b[26] = 900 & 0xff;
      b[27] = 900 >> 8;
      b[28] = 675 & 0xff;
      b[29] = 675 >> 8;
    });
    expect(webpSize(bytes)).toEqual({ width: 900, height: 675 });
  });

  it("reads a lossless (VP8L) header", () => {
    const bits = (917 - 1) | ((917 - 1) << 14);
    const bytes = header("VP8L", (b) => {
      b[21] = bits & 0xff;
      b[22] = (bits >> 8) & 0xff;
      b[23] = (bits >> 16) & 0xff;
      b[24] = (bits >> 24) & 0xff;
    });
    expect(webpSize(bytes)).toEqual({ width: 917, height: 917 });
  });

  it("rejects anything that is not WebP", () => {
    expect(webpSize(new Uint8Array(30))).toBeNull();
    expect(webpSize(new Uint8Array(10))).toBeNull();
  });
});
