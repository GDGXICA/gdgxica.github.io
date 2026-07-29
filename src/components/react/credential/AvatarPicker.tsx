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
      <legend className="text-primary text-sm font-semibold">Tu avatar</legend>

      {/* Mascots first and selected by default. Photo is the deliberate
          opt-in, which keeps the moderation queue small. */}
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {MASCOTS.map((m) => {
          const selected = avatarKind === "mascot" && mascotId === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPickMascot(m.id)}
                aria-pressed={selected}
                aria-label={m.label}
                className={`w-full overflow-hidden rounded-full border-2 transition ${
                  selected ? "border-google-blue" : "border-transparent"
                }`}
              >
                <img src={m.src} alt="" className="h-full w-full" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
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
          className="border-gray-custom text-secondary rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Procesando…" : "Subir mi foto (opcional)"}
        </button>

        {photoDataUrl && (
          <>
            <img
              src={photoDataUrl}
              alt="Foto seleccionada"
              className="h-10 w-10 rounded-full object-cover"
            />
            <button
              type="button"
              onClick={() => onPickPhoto(null)}
              className="text-tertiary text-sm hover:underline"
            >
              Quitar foto
            </button>
          </>
        )}
      </div>

      <p className="text-tertiary text-xs">
        Si subes una foto, la revisamos antes de conservarla. Se ajusta a
        512&nbsp;px en tu dispositivo, así que su ubicación GPS nunca se envía.
      </p>

      {error && <p className="text-sm text-red-700">{error}</p>}
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
