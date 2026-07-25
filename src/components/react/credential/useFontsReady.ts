import { useEffect, useState } from "react";
import { CREDENTIAL_LAYOUT } from "./renderCredential";

/**
 * Blocks the first canvas draw until Geist is actually loaded.
 *
 * ctx.font falls back to the default sans SILENTLY when the face is not
 * ready, and the bug only shows on a cold load — which makes it the single
 * most likely visual defect in this feature, and one nobody would catch
 * while developing with a warm font cache.
 *
 * document.fonts.ready alone is not enough: it settles once the faces the
 * LAYOUT already requested are loaded, and a weight the page never renders
 * in the DOM can still be unloaded when the canvas asks for it. So each
 * weight the renderer uses is loaded explicitly.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // jsdom has no FontFaceSet. Treating that as ready keeps the component
    // renderable in tests instead of hanging on a promise that never
    // settles.
    if (typeof document === "undefined" || !document.fonts) {
      setReady(true);
      return;
    }

    (async () => {
      const family = CREDENTIAL_LAYOUT.fontFamily;
      try {
        await document.fonts.ready;
        await Promise.all([
          document.fonts.load(`700 76px ${family}`),
          document.fonts.load(`600 32px ${family}`),
          document.fonts.load(`500 40px ${family}`),
          document.fonts.load(`400 36px ${family}`),
        ]);
      } catch {
        // A font that fails to load should degrade to the fallback face,
        // not leave the attendee staring at an empty preview.
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
