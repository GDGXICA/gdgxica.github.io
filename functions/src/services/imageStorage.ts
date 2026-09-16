import { randomUUID } from "node:crypto";
import * as admin from "firebase-admin";

const SIGNATURES: {
  ext: string;
  contentType: string;
  matches: (buffer: Buffer) => boolean;
}[] = [
  {
    ext: "jpg",
    contentType: "image/jpeg",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    contentType: "image/png",
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: "webp",
    contentType: "image/webp",

    matches: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

export interface DecodedImage {
  buffer: Buffer;
  ext: string;
  contentType: string;
}

export interface StoredImage {
  path: string;
  url: string;
}

export function decodeImageDataUrl(
  dataUrl: string,
  maxBytes: number,
  allowedExts?: readonly string[]
): DecodedImage | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
  } catch {
    return null;
  }

  if (buffer.length === 0 || buffer.length > maxBytes) return null;

  const candidates = allowedExts
    ? SIGNATURES.filter((s) => allowedExts.includes(s.ext))
    : SIGNATURES;

  const signature = candidates.find((s) => s.matches(buffer));
  if (!signature) return null;

  return {
    buffer,
    ext: signature.ext,
    contentType: signature.contentType,
  };
}

export interface SaveImageOptions {
  cacheControl?: string;
}

export async function saveImageWithToken(
  image: DecodedImage,
  path: string,
  options: SaveImageOptions = {}
): Promise<StoredImage> {
  const bucket = admin.storage().bucket();
  const token = randomUUID();

  await bucket.file(path).save(image.buffer, {
    contentType: image.contentType,
    metadata: {
      cacheControl:
        options.cacheControl ?? "public, max-age=31536000, immutable",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  return { path, url: downloadUrl(bucket.name, path, token) };
}

export function downloadUrl(
  bucketName: string,
  path: string,
  token: string
): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}` +
    `/o/${encodeURIComponent(path)}?alt=media&token=${token}`
  );
}
