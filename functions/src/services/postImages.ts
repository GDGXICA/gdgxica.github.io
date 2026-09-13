import { randomUUID } from "node:crypto";
import * as admin from "firebase-admin";

/**
 * Cloud Storage para las imágenes de los posts del foro.
 *
 * Mismo principio que `credentialStorage.ts`: aquí NADA decodifica una imagen.
 * Los bytes van del cuerpo de la petición al bucket sin pasar por ningún
 * decodificador nuestro, que es lo que deja fuera de alcance toda la familia
 * de CVEs de parseo de imágenes.
 *
 * La diferencia con las credenciales es quién puede leerlas: una imagen de
 * credencial es un dato personal y se sirve con una URL de vida corta; la de
 * un post es contenido público que tiene que salir en el sitio estático y en
 * las tarjetas de redes sociales. Por eso se guarda con un token de descarga
 * de Firebase y se devuelve la URL con ese token: es pública y estable, y no
 * necesita que `storage.rules` conceda lectura a nadie.
 */

/** Cabeceras que identifican cada formato. El MIME del data URL no se cree. */
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
    // "RIFF" …tamaño… "WEBP"
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

/**
 * Decodifica un `data:image/…;base64,…`, rechazando todo lo que no sea de
 * verdad un JPEG, un PNG o un WebP.
 *
 * El prefijo MIME lo escribe quien sube, así que no dice nada; los bytes de
 * cabecera son la carga en sí. El `contentType` con el que se guarda sale de
 * los bytes, no del prefijo: es lo que impide que alguien suba HTML anunciado
 * como imagen y consiga servirlo desde nuestro dominio de Storage.
 */
export function decodeImageDataUrl(
  dataUrl: string,
  maxBytes: number
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

  const signature = SIGNATURES.find((s) => s.matches(buffer));
  if (!signature) return null;

  return {
    buffer,
    ext: signature.ext,
    contentType: signature.contentType,
  };
}

export interface StoredImage {
  path: string;
  url: string;
}

/**
 * Sube la imagen y devuelve su URL pública.
 *
 * El nombre del objeto lo pone el servidor (un UUID), nunca quien sube: un
 * nombre elegido por el cliente permitiría pisar la imagen de otro post y
 * cambiar lo que ya está publicado.
 */
export async function savePostImage(image: DecodedImage): Promise<StoredImage> {
  const bucket = admin.storage().bucket();
  const token = randomUUID();
  const path = `posts/images/${randomUUID()}.${image.ext}`;

  await bucket.file(path).save(image.buffer, {
    contentType: image.contentType,
    metadata: {
      // Contenido público e inmutable: el nombre es un UUID, así que una URL
      // dada siempre devuelve los mismos bytes.
      cacheControl: "public, max-age=31536000, immutable",
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
