// Build-time pixel size of an image in `public/`, so a page can lay photos
// out at their own aspect ratio and still give the browser width and height
// up front (no layout shift while they load).
//
// Reads only the file header. WebP is what the site ships; anything else, a
// missing file, or a remote URL returns null and the caller falls back to
// letting the image size itself.

import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

export interface ImageSize {
  width: number;
  height: number;
}

/** Parses the size out of the first 30 bytes of a WebP file. */
export function webpSize(header: Uint8Array): ImageSize | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...header.subarray(from, to));
  if (header.length < 30) return null;
  if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  const chunk = ascii(12, 16);
  const u24 = (at: number) =>
    header[at] | (header[at + 1] << 8) | (header[at + 2] << 16);
  if (chunk === "VP8X") {
    return { width: u24(24) + 1, height: u24(27) + 1 };
  }
  if (chunk === "VP8 ") {
    return {
      width: (header[26] | (header[27] << 8)) & 0x3fff,
      height: (header[28] | (header[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits =
      header[21] | (header[22] << 8) | (header[23] << 16) | (header[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Size of a site-relative path such as "/gallery/01.webp", or null. */
export function publicImageSize(src: string): ImageSize | null {
  if (!src.startsWith("/") || !src.toLowerCase().endsWith(".webp")) return null;
  let fd: number | null = null;
  try {
    fd = openSync(join(process.cwd(), "public", src), "r");
    const header = new Uint8Array(30);
    readSync(fd, header, 0, 30, 0);
    return webpSize(header);
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
