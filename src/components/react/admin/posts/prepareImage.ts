/**
 * Deja una imagen elegida en el editor lista para subirla.
 *
 * Existe porque el tope del servidor (450 KB ya decodificados) y una foto de
 * móvil de 4 MB no se llevan bien: sin reescalar, la mitad de las subidas
 * rebotarían con un error que no dice qué hacer. El navegador ya tiene lienzo,
 * así que el reescalado es gratis y pasa antes de tocar la red.
 */

/** Debe coincidir con `MAX_IMAGE_BYTES` en functions/src/handlers/posts.ts. */
export const MAX_UPLOAD_BYTES = 450 * 1024;

/** Ancho/alto máximo. 1600 px cubre de sobra el ancho del cuerpo de un post. */
export const MAX_DIMENSION = 1600;

/** Los tres formatos que acepta la API. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Calidades que se prueban en orden hasta entrar en el tope. */
const QUALITY_STEPS = [0.85, 0.7, 0.55];

export type PreparedImage = { dataUrl: string } | { error: string };

/**
 * Encaja unas dimensiones dentro de un cuadrado sin deformarlas. Una imagen
 * que ya cabe no se toca: ampliarla solo añadiría peso sin añadir detalle.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const ratio = max / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Bytes que ocupa lo que codifica un data URL en base64. */
export function decodedBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Solo se admiten imágenes JPG, PNG o WebP" };
  }

  // Si ya cabe, se sube tal cual: reescalar un PNG con transparencia a JPEG
  // le pondría un fondo negro, y recodificar un JPEG que ya vale solo le
  // quita calidad.
  if (file.size <= MAX_UPLOAD_BYTES) {
    return { dataUrl: await readAsDataUrl(file) };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: "No se pudo leer la imagen" };
  }

  const { width, height } = fitWithin(
    bitmap.width,
    bitmap.height,
    MAX_DIMENSION
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "No se pudo procesar la imagen" };
  // Fondo blanco: la imagen sale en JPEG, que no tiene transparencia, y sin
  // esto las zonas transparentes se vuelven negras.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (decodedBytes(dataUrl) <= MAX_UPLOAD_BYTES) return { dataUrl };
  }

  return {
    error:
      "La imagen sigue siendo demasiado pesada. Recórtala o redúcela antes de subirla.",
  };
}
