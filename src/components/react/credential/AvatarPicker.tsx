import { useRef, useState } from "react";
import { MASCOTS } from "./mascots";
import { downscalePhoto } from "./exportCanvas";
import { MAX_PHOTO_DATAURL_CHARS } from "./limits";

interface Props {
  avatarKind: "photo" | "mascot";
  mascotId: string;
  photoDataUrl: string | null;
  onPickMascot: (id: string) => void;
  onPickPhoto: (dataUrl: string | null) => void;
}

/** Rejected before reading, so a 12 MP photo never hits the main thread. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PHOTO_SIZE = 512;

export function AvatarPicker({
  avatarKind,
  mascotId,
  photoDataUrl,
  onPickMascot,
  onPickPhoto,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);

    if (file.size > MAX_FILE_BYTES) {
      setError("La imagen pesa más de 10 MB. Elige una más liviana.");
      return;
    }

    setBusy(true);
    try {
      // FileReader.readAsDataURL, NEVER URL.createObjectURL: `blob:` is
      // absent from the site's `img-src 'self' data: https:` CSP directive
      // (see firebase.json), so an object URL would be blocked — and only
      // in production, because the dev server sends no CSP header.
      const dataUrl = await readAsDataUrl(file);
      const image = await decode(dataUrl);

      // Re-encoding through the canvas is what strips EXIF, GPS included,
      // so location data never leaves the device.
      const downscaled = downscalePhoto(
        image,
        image.naturalWidth,
        image.naturalHeight,
        PHOTO_SIZE,
        MAX_PHOTO_DATAURL_CHARS
      );

      if (!downscaled) {
        setError("No pudimos procesar la imagen. Intenta con otra.");
        return;
      }
      onPickPhoto(downscaled.dataUrl);
    } catch {
      setError("No pudimos leer la imagen. Intenta con otra.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[0.9375rem] font-medium text-(--ink)">
        Elige tu avatar
      </legend>

      {/* Mascots first and selected by default. Photo is the deliberate
          opt-in, which keeps the moderation queue small. */}
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8 sm:gap-2.5">
        {MASCOTS.map((m) => {
          const selected = avatarKind === "mascot" && mascotId === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPickMascot(m.id)}
                aria-pressed={selected}
                aria-label={m.label}
                className={`block w-full overflow-hidden rounded-full border-2 bg-(--surface-2) transition-[transform,border-color] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  selected
                    ? "border-(--ochre) ring-2 ring-(--ochre)/35 ring-offset-2 ring-offset-(--night)"
                    : "border-transparent hover:border-(--line-strong)"
                }`}
              >
                {/* object-cover so a future asset that is not perfectly
                    square gets centre-cropped here, matching what the
                    canvas does, instead of being stretched. */}
                <img
                  src={m.src}
                  alt=""
                  width={512}
                  height={512}
                  decoding="async"
                  className="aspect-square h-full w-full object-cover"
                />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Attribution sits next to the use, not three clicks away. Several of
          these licences require the credit to be given wherever the art is
          used, so this link is an obligation rather than a courtesy. */}
      <p className="text-sm leading-6 text-(--muted)">
        Mascotas de Go, Rust, Linux y Android usadas con licencia abierta.{" "}
        <a href="/creditos" className="n-link text-(--ink)">
          Ver créditos y licencias
        </a>
        .
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="nb nb--ghost"
        >
          <span className="nb__label">
            {busy ? "Procesando…" : "Subir mi foto (opcional)"}
          </span>
          <span className="nb__icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14" />
            </svg>
          </span>
        </button>

        {photoDataUrl && (
          <>
            <img
              src={photoDataUrl}
              alt="Foto seleccionada"
              className="h-11 w-11 rounded-full object-cover ring-2 ring-(--ochre)"
            />
            <button
              type="button"
              onClick={() => onPickPhoto(null)}
              className="n-link min-h-11 text-[0.9375rem] text-(--muted)"
            >
              Quitar foto
            </button>
          </>
        )}
      </div>

      <p className="text-sm leading-6 text-(--muted)">
        Si subes una foto, la revisamos antes de conservarla. Se ajusta a
        512&nbsp;px en tu dispositivo, así que su ubicación GPS nunca se envía.
      </p>

      {error && <p className="text-sm font-medium text-red-300">{error}</p>}
    </fieldset>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
