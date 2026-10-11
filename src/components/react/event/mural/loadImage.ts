export interface LoadedImage {
  width: number;
  height: number;
}

export const LOAD_TIMEOUT_MS = 30_000;

export function loadImage(
  url: string,
  timeoutMs = LOAD_TIMEOUT_MS
): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      reject(new Error(`Tardó demasiado en cargar ${url}`));
    }, timeoutMs);
    img.decoding = "async";
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`No se pudo cargar ${url}`));
    };
    img.src = url;
  });
}
