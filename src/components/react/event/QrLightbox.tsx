import { useEffect } from "react";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  qrDataUrl: string;
  url: string;
  caption: string;
  subtitle?: string;
  alt: string;
  onClose: () => void;
}

export function QrLightbox({
  open,
  qrDataUrl,
  url,
  caption,
  subtitle,
  alt,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const displayUrl = url.replace(/^https?:\/\//, "");

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-6 backdrop-blur-md sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="QR ampliado"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-black/80 px-4 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/10 sm:top-6 sm:right-8"
        aria-label="Cerrar QR grande"
      >
        <CloseIcon size={16} />
        <span>Cerrar</span>
        <kbd className="hidden rounded border border-white/25 px-1.5 font-mono text-[11px] text-white/65 sm:inline">
          Esc
        </kbd>
      </button>

      <div
        className="flex max-w-full flex-col items-center gap-5 text-center sm:gap-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <p className="font-mono text-sm font-semibold tracking-[0.22em] text-(--ochre) uppercase sm:text-base">
            {caption}
          </p>
          {subtitle && (
            <p className="text-sm text-white/70 sm:text-base">{subtitle}</p>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/15 bg-[#0b0d13] p-4 shadow-[0_32px_90px_-24px_rgba(0,0,0,0.95)] sm:p-5">
          <div
            aria-hidden="true"
            className="mb-3.5 flex h-1.5 w-full overflow-hidden rounded-full"
          >
            <span className="bg-google-blue flex-1" />
            <span className="bg-google-red flex-1" />
            <span className="bg-google-yellow flex-1" />
            <span className="bg-google-green flex-1" />
          </div>
          <div className="aspect-square h-[min(58vh,520px)] max-h-[80vw] w-[min(58vh,520px)] max-w-[80vw] rounded-2xl bg-white p-4 sm:p-6">
            <img
              src={qrDataUrl}
              alt={alt}
              className="h-full w-full object-contain"
            />
          </div>
        </div>

        <p className="max-w-full rounded-full border border-white/15 bg-white/[0.05] px-5 py-2.5 font-mono text-sm break-all text-white/95 sm:text-xl">
          {displayUrl}
        </p>
      </div>
    </div>
  );
}
