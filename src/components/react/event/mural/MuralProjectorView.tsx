import { useEffect, useMemo, useRef, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";
import { HeroQr } from "../HeroQr";
import { useApprovedMuralPhotos } from "./useApprovedMuralPhotos";
import {
  EMPTY_ROTATION,
  ROTATE_MS,
  peekNext,
  reconcileTiles,
  rotateTiles,
  type Rotation,
} from "./wall";

interface Props {
  slug: string;
  eventName: string;
  headline: string;
  uploadUrl: string;

  qrDataUrl: string;
}

const HIGHLIGHT_MS = 12_000;

export function MuralProjectorView({
  slug,
  eventName,
  headline,
  uploadUrl,
  qrDataUrl,
}: Props) {
  const { photos } = useApprovedMuralPhotos(slug);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const [rotation, setRotation] = useState<Rotation>(EMPTY_ROTATION);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const pool = useMemo(
    () => photos.filter((p) => p.downloadUrl && !broken.has(p.id)),
    [photos, broken]
  );
  const poolIds = useMemo(() => pool.map((p) => p.id), [pool]);
  const byId = useMemo(
    () => new Map(pool.map((p) => [p.id, p] as const)),
    [pool]
  );

  const poolRef = useRef<string[]>([]);
  const freshRef = useRef<string[]>([]);
  poolRef.current = poolIds;

  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const arrived = poolIds.filter((id) => !seen.current.has(id));

    const isFirstLoad = seen.current.size === 0;
    for (const id of poolIds) seen.current.add(id);

    setRotation((r) => ({ ...r, tiles: reconcileTiles(r.tiles, poolIds) }));

    if (arrived.length === 0 || isFirstLoad) return;

    freshRef.current = [...arrived, ...freshRef.current];
    setFresh((prev) => new Set([...prev, ...arrived]));

    const timer = window.setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        for (const id of arrived) next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [poolIds]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRotation((r) => {
        const next = rotateTiles(r, poolRef.current, freshRef.current);

        freshRef.current = freshRef.current.filter(
          (candidate) => !next.tiles.includes(candidate)
        );
        return next;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const next = peekNext(rotation, poolIds, freshRef.current);
    if (!next) return;
    const photo = byId.get(next);
    if (!photo?.downloadUrl) return;
    const img = new Image();
    img.src = photo.downloadUrl;
  }, [rotation, poolIds, byId]);

  const tiles = rotation.tiles
    .map((id) => byId.get(id))
    .filter((p): p is MuralPhoto => Boolean(p));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-4">
        <div>
          <p className="text-xs tracking-widest text-white/50 uppercase">
            GDG ICA · Mural
          </p>
          <h1 className="text-2xl font-semibold">{headline || eventName}</h1>
        </div>
        <div className="text-right">
          <p className="text-xs tracking-widest text-white/50 uppercase">
            Sube tus fotos
          </p>
          <p className="font-mono text-sm text-white/80">{uploadUrl}</p>
        </div>
      </header>

      {tiles.length === 0 ? (
        <HeroQr
          qrDataUrl={qrDataUrl}
          url={uploadUrl}
          caption="Escanea y sube tu primera foto"
          alt="QR para subir fotos al mural"
        />
      ) : (
        <>
          <main className="flex-1 p-6">
            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-4">
              {tiles.map((photo) => (
                <figure
                  key={photo.id}
                  className={`relative overflow-hidden rounded-2xl bg-white/5 ${
                    fresh.has(photo.id) ? "ring-4 ring-amber-400" : ""
                  }`}
                >
                  <img
                    src={photo.downloadUrl ?? ""}
                    alt=""
                    className="aspect-square w-full object-cover"
                    onError={() =>
                      setBroken((prev) => new Set(prev).add(photo.id))
                    }
                  />
                  {photo.alias && (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-lg text-white">
                      {photo.alias}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </main>

          <footer className="flex items-center justify-end gap-4 border-t border-white/10 px-8 py-4">
            <p className="text-right text-sm text-white/70">
              ¿Tienes fotos?
              <br />
              <span className="font-mono text-white">{uploadUrl}</span>
            </p>

            <img
              src={qrDataUrl}
              alt=""
              className="h-24 w-24 rounded bg-white p-1"
            />
          </footer>
        </>
      )}
    </div>
  );
}

export default MuralProjectorView;
