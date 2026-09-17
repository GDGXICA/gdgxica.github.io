import * as admin from "firebase-admin";
import {
  type DecodedImage,
  type StoredImage,
  saveImageWithToken,
} from "./imageStorage";

export function muralObjectPath(slug: string, photoId: string): string {
  return `mural/${slug}/${photoId}.jpg`;
}

export const MURAL_CACHE_CONTROL = "public, max-age=600";

export async function saveMuralPhoto(
  slug: string,
  photoId: string,
  image: DecodedImage
): Promise<StoredImage> {
  return saveImageWithToken(image, muralObjectPath(slug, photoId), {
    cacheControl: MURAL_CACHE_CONTROL,
  });
}

export async function deleteMuralPhoto(path: string): Promise<void> {
  await admin.storage().bucket().file(path).delete({ ignoreNotFound: true });
}
