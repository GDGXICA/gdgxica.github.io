import { useState } from "react";

interface Props {
  /** data: URL of the composed card. */
  imageDataUrl: string | null;
  fileName: string;
  shareText: string;
  pageUrl: string;
}

/** Turns a data URL into a File, for the Web Share API. */
function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  try {
    const [header, payload] = dataUrl.split(",");
    const mime = /:(.*?);/.exec(header)?.[1] ?? "image/jpeg";
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Share controls.
 *
 * Web Share first because on mobile it posts the ACTUAL image into
 * WhatsApp or Instagram — and it sidesteps the CSP entirely. The download
 * fallback matters because some mobile browsers ignore `download` on a
 * `data:` URL, which is exactly why it is second and not first.
 *
 * The social links can only ever share the page URL: every platform strips
 * a client-side image out of a share intent. Saying so on screen is better
 * than a button that silently posts a link when the user expected a card.
 */
export function ShareBar({
  imageDataUrl,
  fileName,
  shareText,
  pageUrl,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const share = async () => {
    if (!imageDataUrl) return;
    const file = dataUrlToFile(imageDataUrl, fileName);

    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareText });
        return;
      } catch {
        // A cancelled share throws; fall through to the download.
      }
    }
    setStatus("Tu navegador no permite compartir la imagen directamente.");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus("No pudimos copiar el enlace.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {/* No href at all while there is no image, rather than href="#" with
            aria-disabled. An anchor without href is not a link: it leaves the
            tab order and cannot be activated. With "#" it stayed focusable and
            clickable, and clicking it navigated — aria-disabled only relabels
            an element, it never stops it doing anything. */}
        <a
          href={imageDataUrl ?? undefined}
          download={imageDataUrl ? fileName : undefined}
          aria-disabled={!imageDataUrl}
          className={`bg-google-green rounded-lg px-4 py-3 text-sm font-semibold text-white ${
            imageDataUrl ? "" : "opacity-50"
          }`}
        >
          Descargar credencial
        </a>
        <button
          type="button"
          onClick={share}
          disabled={!imageDataUrl}
          className="bg-google-blue rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Compartir
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="border-gray-custom text-secondary rounded-lg border px-4 py-3 text-sm"
        >
          {copied ? "Enlace copiado" : "Copiar enlace"}
        </button>
      </div>
      {/* Announced, not just drawn: every message here reports the outcome of
          a button the user just pressed, and that button keeps focus. */}
      {status && (
        <p role="status" className="text-tertiary text-xs">
          {status}
        </p>
      )}
    </div>
  );
}
