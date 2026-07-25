import { useEffect, useState } from "react";

/**
 * Decodes a same-origin or data: URL into an image the canvas can draw.
 *
 * drawCredential is synchronous by contract, so every image has to be
 * decoded before it is called. That is what lets the export run on the very
 * next line after a draw.
 *
 * Only `data:` URLs and same-origin paths are ever passed here. A
 * cross-origin source without a CORS-clean load taints the canvas and makes
 * toDataURL throw SecurityError at export time — which is why the GitHub
 * avatar is never fetched and the username renders as text instead.
 */
export function useDecodedImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const img = new Image();

    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      // The renderer falls back to initials rather than leaving a hole.
      if (!cancelled) setImage(null);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}
