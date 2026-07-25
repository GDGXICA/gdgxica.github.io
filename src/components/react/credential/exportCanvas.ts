// Canvas creation and encoding for the credential.
//
// Kept apart from renderCredential.ts so the drawing math stays a pure
// function of a 2D context: this module is the only place that touches
// document, devicePixelRatio and toDataURL.

import {
  CREDENTIAL_LAYOUT,
  drawCredential,
  type CredentialLayout,
  type CredentialRenderInput,
} from "./renderCredential";

/**
 * Preview canvases never scale past 2x.
 *
 * A 3x Android phone would otherwise back a 360 px preview with a
 * 3240 px canvas, redrawn on every keystroke, which janks badly on the
 * low-end hardware most attendees will use.
 */
export const MAX_PREVIEW_DPR = 2;

/** Quality ladder for encodeUnderBudget, best first. */
export const QUALITY_LADDER = [0.9, 0.82, 0.72, 0.6] as const;

/**
 * Off-screen export canvas at the layout's native size.
 *
 * Deliberately independent of devicePixelRatio: what the attendee
 * downloads and what we store must not depend on the screen that happened
 * to generate it.
 */
export function renderToCanvas(
  input: CredentialRenderInput,
  layout: CredentialLayout = CREDENTIAL_LAYOUT
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el lienzo de la credencial");

  drawCredential(ctx, input, layout);
  return canvas;
}

/**
 * Sizes a visible canvas for the current screen and draws into it.
 *
 * The backing store is scaled by the capped DPR while the context is
 * scaled by the same factor, so CREDENTIAL_LAYOUT's coordinates keep
 * meaning the same thing in both the preview and the export.
 */
export function renderPreview(
  canvas: HTMLCanvasElement,
  input: CredentialRenderInput,
  cssWidth: number,
  layout: CredentialLayout = CREDENTIAL_LAYOUT
): void {
  const dpr = Math.min(
    typeof devicePixelRatio === "number" && devicePixelRatio > 0
      ? devicePixelRatio
      : 1,
    MAX_PREVIEW_DPR
  );
  const scale = (cssWidth / layout.width) * dpr;

  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * layout.height) / layout.width}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(scale, scale);
  drawCredential(ctx, input, layout);
}

/** Decoded byte length of a base64 data URL, without decoding it. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;

  const b64 = dataUrl.slice(comma + 1);
  if (b64.length === 0) return 0;

  // Every 4 base64 chars carry 3 bytes; each '=' pad removes one.
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Encodes to JPEG at the best quality that fits `maxChars`.
 *
 * The cap is on data-URL CHARACTERS rather than decoded bytes because
 * that is what the server's Zod schema bounds — it validates the string it
 * receives, and matching the unit here is what stops a submission from
 * being rejected after the attendee already saw a preview.
 *
 * Returns null when even the lowest quality overflows, so the caller can
 * fall back rather than POST something that will 400.
 */
export function encodeUnderBudget(
  canvas: HTMLCanvasElement,
  maxChars: number,
  qualities: readonly number[] = QUALITY_LADDER
): { dataUrl: string; chars: number; bytes: number; quality: number } | null {
  for (const quality of qualities) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= maxChars) {
      return {
        dataUrl,
        chars: dataUrl.length,
        bytes: dataUrlByteLength(dataUrl),
        quality,
      };
    }
  }
  return null;
}

/**
 * Downscales a user-picked photo into a square JPEG data URL.
 *
 * Two things happen here beyond resizing. The canvas re-encode strips
 * EXIF, so a phone photo's GPS coordinates never reach our storage — the
 * strongest privacy property of this whole flow. And it caps the upload at
 * a size that fits the API's payload budget, since the client has to
 * rasterize for the credential anyway.
 *
 * Takes an ALREADY DECODED image: decoding must happen from a `data:` URL
 * via FileReader, never URL.createObjectURL, because `blob:` is absent
 * from the site's img-src CSP directive.
 */
export function downscalePhoto(
  image: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  size: number,
  maxChars: number
): { dataUrl: string; chars: number; bytes: number } | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // White matte: JPEG has no alpha, and an unpainted canvas encodes as
  // black behind a transparent PNG upload.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const { sx, sy, sw, sh } = coverSquare(srcWidth, srcHeight, size);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);

  const encoded = encodeUnderBudget(canvas, maxChars);
  return encoded
    ? { dataUrl: encoded.dataUrl, chars: encoded.chars, bytes: encoded.bytes }
    : null;
}

/** coverRect specialised to a square destination. */
function coverSquare(srcW: number, srcH: number, size: number) {
  const side = Math.min(srcW, srcH);
  return {
    sx: (srcW - side) / 2,
    sy: (srcH - side) / 2,
    sw: side,
    sh: side,
    size,
  };
}
