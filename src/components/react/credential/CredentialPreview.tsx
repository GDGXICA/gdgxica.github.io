import { useEffect, useRef } from "react";
import { renderPreview } from "./exportCanvas";
import type { CredentialRenderInput } from "./renderCredential";

interface Props {
  input: CredentialRenderInput;
  /** Blocks the first draw until the real typeface is loaded. */
  fontsReady: boolean;
}

/**
 * Live preview of the credential.
 *
 * Redraws on every state change through requestAnimationFrame so a burst
 * of keystrokes coalesces into one paint instead of one per character.
 */
export function CredentialPreview({ input, fontsReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontsReady) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      const width = canvas.parentElement?.clientWidth ?? 360;
      renderPreview(canvas, input, width);
    });

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [input, fontsReady]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        // The canvas is decorative here — the same information is in the
        // form beside it — but it must still announce what it shows.
        role="img"
        aria-label={`Vista previa de la credencial de ${input.firstName} ${input.lastName}`}
        className="border-gray-custom w-full rounded-xl border shadow-sm"
      />
      {!fontsReady && (
        <p className="text-tertiary mt-2 text-center text-xs">
          Preparando la tipografía…
        </p>
      )}
    </div>
  );
}
