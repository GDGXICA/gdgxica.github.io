import { useCallback, useEffect, useState } from "react";

export function useFullscreen(): {
  immersive: boolean;
  toggle: () => Promise<void>;
} {
  const [native, setNative] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const sync = () => {
      const active = Boolean(document.fullscreenElement);
      setNative(active);
      if (active) setFallback(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!fallback) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFallback(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fallback]);

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    if (fallback) {
      setFallback(false);
      return;
    }
    try {
      const root = document.documentElement;
      if (typeof root.requestFullscreen !== "function") {
        throw new Error("Pantalla completa no disponible");
      }
      await root.requestFullscreen();
    } catch {
      setFallback(true);
    }
  }, [fallback]);

  return { immersive: native || fallback, toggle };
}
