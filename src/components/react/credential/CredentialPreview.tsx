import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { renderPreview } from "./exportCanvas";
import type { CredentialRenderInput } from "./renderCredential";

interface Props {
  input: CredentialRenderInput;
  /** Blocks the first draw until the real typeface is loaded. */
  fontsReady: boolean;
  /** Accessible name supplied by the caller, which knows if the name is real. */
  label: string;
}

/** Live preview with an accessible, full-screen 3D inspection mode. */
export function CredentialPreview({ input, fontsReady, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!fontsReady) return;

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const width = canvas.parentElement?.clientWidth ?? 360;
        renderPreview(canvas, input, width);
      }

      const modalCanvas = modalCanvasRef.current;
      if (open && modalCanvas) {
        const width = Math.min(window.innerWidth * 0.72, 620);
        renderPreview(modalCanvas, input, Math.max(width, 280));
      }
    };

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(draw);
    window.addEventListener("resize", draw);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", draw);
    };
  }, [input, fontsReady, open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const element = tiltRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    element.style.setProperty("--card-rotate-x", `${(0.5 - y) * 10}deg`);
    element.style.setProperty("--card-rotate-y", `${(x - 0.5) * 12}deg`);
    element.style.setProperty("--card-shine-x", `${x * 100}%`);
    element.style.setProperty("--card-shine-y", `${y * 100}%`);
  };

  const resetTilt = () => {
    const element = tiltRef.current;
    if (!element) return;
    element.style.setProperty("--card-rotate-x", "0deg");
    element.style.setProperty("--card-rotate-y", "0deg");
    element.style.setProperty("--card-shine-x", "50%");
    element.style.setProperty("--card-shine-y", "35%");
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in rounded-(--radius-sm) text-left"
        aria-label={`Ampliar ${label.toLowerCase()}`}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="w-full rounded-(--radius-sm) transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
        />
        <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-(--radius-sm) border border-(--line-strong) bg-(--night) px-3 py-1.5 text-sm font-medium text-(--ink) opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="text-(--ochre)">
            <ExpandIcon />
          </span>
          Ver en 3D
        </span>
      </button>

      {!fontsReady && (
        <p className="mt-2 text-center text-sm text-(--muted)">
          Preparando la tipografía…
        </p>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-(--night)/95 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Vista ampliada de la credencial"
            onClick={() => setOpen(false)}
          >
            <div className="cred-modal-grid absolute inset-0" />
            <button
              type="button"
              autoFocus
              onClick={() => setOpen(false)}
              className="absolute top-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-(--radius-sm) border border-(--line-strong) bg-(--surface-2) text-2xl text-(--ink) transition-colors hover:bg-(--surface-3)"
              aria-label="Cerrar vista ampliada"
            >
              ×
            </button>

            <div
              className="animate-credential-modal-card relative z-10"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                ref={tiltRef}
                onPointerMove={tilt}
                onPointerLeave={resetTilt}
                className="credential-card-tilt relative overflow-hidden rounded-(--radius) bg-white shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
              >
                <canvas
                  ref={modalCanvasRef}
                  role="img"
                  aria-label={label}
                  className="block h-auto max-h-[82vh] w-auto max-w-[82vw]"
                />
                <span className="credential-card-shine pointer-events-none absolute inset-0" />
                <span className="pointer-events-none absolute inset-0 rounded-(--radius) ring-1 ring-white/30 ring-inset" />
              </div>
              <p className="mt-5 text-center text-sm text-(--muted)">
                Mueve el cursor para explorar · Esc para cerrar
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
    </svg>
  );
}
