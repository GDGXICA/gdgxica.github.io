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
        <a
          href={imageDataUrl ?? "#"}
          download={fileName}
          aria-disabled={!imageDataUrl}
          className="bg-google-green rounded-lg px-4 py-2 text-sm font-semibold text-white"
        >
          Descargar credencial
        </a>
        <button
          type="button"
          onClick={share}
          disabled={!imageDataUrl}
          className="bg-google-blue rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Compartir
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="border-gray-custom text-secondary rounded-lg border px-4 py-2 text-sm"
        >
          {copied ? "Enlace copiado" : "Copiar enlace"}
        </button>
      </div>
      {status && <p className="text-tertiary text-xs">{status}</p>}
    </div>
  );
}
