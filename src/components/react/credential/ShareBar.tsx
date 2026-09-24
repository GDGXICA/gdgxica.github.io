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
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    download(imageDataUrl, fileName);
    setStatus("Descargamos la imagen para que puedas compartirla.");
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
    <div className="border-gray-custom flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <p className="text-primary font-bold">Guárdala y compártela</p>
        <p className="text-tertiary mt-1 text-xs leading-5">
          Descarga la imagen en alta calidad o envíala directamente a tus redes.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* No href at all while there is no image, rather than href="#" with
            aria-disabled. An anchor without href is not a link: it leaves the
            tab order and cannot be activated. With "#" it stayed focusable and
            clickable, and clicking it navigated — aria-disabled only relabels
            an element, it never stops it doing anything. */}
        <a
          href={imageDataUrl ?? undefined}
          download={imageDataUrl ? fileName : undefined}
          aria-disabled={!imageDataUrl}
          className={`bg-google-blue col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-center text-sm font-bold text-white shadow-[0_10px_24px_rgba(36,99,235,0.2)] transition hover:-translate-y-0.5 hover:bg-blue-700 ${
            imageDataUrl ? "" : "opacity-50"
          }`}
        >
          <DownloadIcon />
          Descargar imagen
        </a>
        <button
          type="button"
          onClick={share}
          disabled={!imageDataUrl}
          className="border-gray-custom text-primary flex min-h-12 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50"
        >
          <ShareIcon />
          Compartir
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="border-gray-custom text-primary flex min-h-12 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold transition hover:border-blue-200 hover:bg-blue-50"
        >
          <LinkIcon />
          {copied ? "Copiado" : "Copiar enlace"}
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

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

function download(dataUrl: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}
