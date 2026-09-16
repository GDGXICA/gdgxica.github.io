import { MAX_MURAL_PHOTO_BYTES } from "@/lib/imageLimits";
import { prepareImage, type PreparedImage } from "@/lib/prepareImage";

export function prepareMuralPhoto(file: File): Promise<PreparedImage> {
  return prepareImage(file, {
    forceReencode: true,
    maxBytes: MAX_MURAL_PHOTO_BYTES,

    maxDimension: 1600,
  });
}

export function clientRequestIdFor(file: File): string {
  const seed = `${file.name}|${file.size}|${file.lastModified}`;
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    const code = seed.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (a >>> 7);
  }
  const part = (n: number) => (n >>> 0).toString(36);
  return `f${part(a)}${part(b)}${file.size.toString(36)}`
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .padEnd(8, "0")
    .slice(0, 64);
}
