import { MAX_POST_IMAGE_BYTES } from "./imageLimits";

export const MAX_DIMENSION = 1600;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const QUALITY_STEPS = [0.85, 0.7, 0.55];

export interface PrepareOptions {
  forceReencode?: boolean;
  maxBytes?: number;
  maxDimension?: number;
  qualitySteps?: number[];
}

export type PreparedImage =
  | {
      dataUrl: string;

      width: number | null;
      height: number | null;
    }
  | { error: string };

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

export async function prepareImage(
  file: File,
  options: PrepareOptions = {}
): Promise<PreparedImage> {
  const {
    forceReencode = false,
    maxBytes = MAX_POST_IMAGE_BYTES,
    maxDimension = MAX_DIMENSION,
    qualitySteps = QUALITY_STEPS,
  } = options;

  if (!ACCEPTED.includes(file.type)) {
    return { error: "Solo se admiten imágenes JPG, PNG o WebP" };
  }

  if (!forceReencode && file.size <= maxBytes) {
    return { dataUrl: await readAsDataUrl(file), width: null, height: null };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { error: "No se pudo leer la imagen" };
  }

  const { width, height } = fitWithin(
    bitmap.width,
    bitmap.height,
    maxDimension
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "No se pudo procesar la imagen" };

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of qualitySteps) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (decodedBytes(dataUrl) <= maxBytes) return { dataUrl, width, height };
  }

  return {
    error:
      "La imagen sigue siendo demasiado pesada. Recórtala o redúcela antes de subirla.",
  };
}
