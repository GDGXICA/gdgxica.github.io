import { useCallback, useEffect, useRef, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";
import { loadImage, type LoadedImage } from "./loadImage";

export const ADMISSION_CONCURRENCY = 6;
export const SETTLE_TIMEOUT_MS = 4000;

export function usePhotoAdmission(
  photos: readonly MuralPhoto[],
  loading: boolean
): {
  ready: ReadonlyMap<string, LoadedImage>;
  broken: ReadonlySet<string>;
  settled: boolean;
  markBroken: (id: string) => void;
} {
  const [ready, setReady] = useState<ReadonlyMap<string, LoadedImage>>(
    () => new Map()
  );
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [timedOut, setTimedOut] = useState(false);
  const inFlight = useRef(new Set<string>());
  const initial = useRef<string[] | null>(null);

  if (!loading && initial.current === null) {
    initial.current = photos.map((p) => p.id);
  }

  const markBroken = useCallback((id: string) => {
    setBroken((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  useEffect(() => {
    for (const photo of photos) {
      if (inFlight.current.size >= ADMISSION_CONCURRENCY) break;
      if (
        ready.has(photo.id) ||
        broken.has(photo.id) ||
        inFlight.current.has(photo.id)
      ) {
        continue;
      }
      if (!photo.downloadUrl) {
        markBroken(photo.id);
        continue;
      }
      inFlight.current.add(photo.id);
      loadImage(photo.downloadUrl).then(
        (size) => {
          inFlight.current.delete(photo.id);
          setReady((prev) => new Map(prev).set(photo.id, size));
        },
        () => {
          inFlight.current.delete(photo.id);
          markBroken(photo.id);
        }
      );
    }
  }, [photos, ready, broken, markBroken]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const settled =
    !loading &&
    (timedOut ||
      (initial.current ?? []).every((id) => ready.has(id) || broken.has(id)));

  return { ready, broken, settled, markBroken };
}
