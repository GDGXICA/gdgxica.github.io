import { randomUUID } from "node:crypto";
import { type DecodedImage, saveImageWithToken } from "./imageStorage";

export {
  decodeImageDataUrl,
  downloadUrl,
  type DecodedImage,
  type StoredImage,
} from "./imageStorage";

export async function savePostImage(image: DecodedImage) {
  return saveImageWithToken(image, `posts/images/${randomUUID()}.${image.ext}`);
}
