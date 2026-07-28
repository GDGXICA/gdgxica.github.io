import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// Cloud Storage for the credential photo and the composed card.
//
// Written exclusively through the Admin SDK, which bypasses storage.rules.
// No anonymous principal ever holds a write grant on the bucket: the images
// arrive as base64 in the request body and this module is the only thing
// that puts bytes in the bucket.
//
// Nothing here DECODES an image. Buffers go straight from the request to
// the bucket and to nodemailer, which is what keeps the entire
// image-parser CVE class out of scope — we never hand user bytes to a
// decoder running with our privileges.

/** JPEG SOI marker. The only format the schema admits. */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export interface CredentialImagePaths {
  photoPath: string | null;
  credentialImagePath: string | null;
}

export function photoObjectPath(slug: string, credentialId: string): string {
  return `credentials/${slug}/${credentialId}/photo.jpg`;
}

export function credentialObjectPath(
  slug: string,
  credentialId: string
): string {
  return `credentials/${slug}/${credentialId}/credential.jpg`;
}

/**
 * Decodes a `data:image/jpeg;base64,...` URL, rejecting anything whose
 * bytes are not actually a JPEG.
 *
 * The schema already pins the MIME prefix, but the prefix is attacker-
 * controlled text; the magic bytes are the payload itself. Returns null
 * rather than throwing so a bad image degrades the record instead of
 * failing the whole registration.
 */
export function decodeJpegDataUrl(
  dataUrl: string | null,
  maxBytes: number
): Buffer | null {
  if (!dataUrl) return null;

  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
  } catch {
    return null;
  }

  if (buffer.length === 0 || buffer.length > maxBytes) return null;
  for (let i = 0; i < JPEG_MAGIC.length; i++) {
    if (buffer[i] !== JPEG_MAGIC[i]) return null;
  }
  return buffer;
}

/**
 * Uploads whichever images were supplied.
 *
 * Called AFTER the credential transaction commits, deliberately: Cloud
 * Storage is not transactional, and a failed image upload must not lose a
 * registration. On failure the record simply keeps a null path — still
 * complete for loading into Bevy, which is the part that actually matters
 * to the attendee.
 */
export async function saveCredentialImages(
  slug: string,
  credentialId: string,
  images: { photo?: Buffer | null; credential?: Buffer | null }
): Promise<CredentialImagePaths> {
  const bucket = admin.storage().bucket();
  const result: CredentialImagePaths = {
    photoPath: null,
    credentialImagePath: null,
  };

  const uploads: Array<{
    key: "photo" | "credential";
    path: string;
    body: Buffer;
  }> = [];
  if (images.photo) {
    uploads.push({
      key: "photo",
      path: photoObjectPath(slug, credentialId),
      body: images.photo,
    });
  }
  if (images.credential) {
    uploads.push({
      key: "credential",
      path: credentialObjectPath(slug, credentialId),
      body: images.credential,
    });
  }

  await Promise.all(
    uploads.map(async (upload) => {
      try {
        await bucket.file(upload.path).save(upload.body, {
          contentType: "image/jpeg",
          // Private and uncached: these are personal images read only by
          // organizers through a short-lived download URL.
          metadata: { cacheControl: "private, max-age=0" },
        });
        if (upload.key === "photo") result.photoPath = upload.path;
        else result.credentialImagePath = upload.path;
      } catch (err) {
        logger.error("Credential image upload failed", {
          slug,
          credentialId,
          key: upload.key,
          err,
        });
      }
    })
  );

  return result;
}

/**
 * Deletes both objects for a credential.
 *
 * Used by photo take-down. `ignoreNotFound` so a partially-uploaded record
 * can still be moderated — otherwise a missing object would block the
 * status flip and leave the panel unable to action the row.
 */
export async function deleteCredentialImages(
  slug: string,
  credentialId: string
): Promise<void> {
  const bucket = admin.storage().bucket();
  await Promise.all(
    [
      photoObjectPath(slug, credentialId),
      credentialObjectPath(slug, credentialId),
    ].map(async (path) => {
      try {
        await bucket.file(path).delete({ ignoreNotFound: true });
      } catch (err) {
        logger.error("Credential image delete failed", { slug, path, err });
      }
    })
  );
}

/** Reads an object back, for attaching the card to an email. */
export async function readCredentialImage(
  path: string
): Promise<Buffer | null> {
  try {
    const [buffer] = await admin.storage().bucket().file(path).download();
    return buffer;
  } catch (err) {
    logger.warn("Credential image download failed", { path, err });
    return null;
  }
}
