import { useCallback, useEffect, useMemo, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";
import { HeroQr } from "../HeroQr";
import { QrLightbox } from "../QrLightbox";
import { CameraIcon, ExpandIcon, FullscreenIcon, QrIcon } from "../icons";
import { RibbonWall } from "./RibbonWall";
import { Spotlight } from "./Spotlight";
import { photoAspect } from "./ribbons";
import { useApprovedMuralPhotos } from "./useApprovedMuralPhotos";
import { useFullscreen } from "./useFullscreen";
import { useIdle } from "./useIdle";
import { useMuralSettings } from "./useMuralSettings";
import { usePhotoAdmission } from "./usePhotoAdmission";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useSpotlight } from "./useSpotlight";

interface Props {
  slug: string;
  eventName: string;
  headline: string;
  uploadUrl: string;
  qrDataUrl: string;
}

export const IDLE_MS = 3000;

function naturalAspect(
  natural: { width: number; height: number } | undefined,
  photo: MuralPhoto
): number {
  const width = natural?.width || photo.width;
  const height = natural?.height || photo.height;
  return width > 0 && height > 0 ? width / height : 4 / 3;
}

export function MuralProjectorView({
  slug,
  eventName,
  headline,
  uploadUrl,
  qrDataUrl,
}: Props) {
  const { photos, loading, synced } = useApprovedMuralPhotos(slug);
  const { settings, loading: settingsLoading } = useMuralSettings(slug);
  const { ready, broken, settled, markBroken } = usePhotoAdmission(
    photos,
    loading
  );
  const spotlight = useSpotlight(photos, loading, synced, ready, broken);
  const { immersive, toggle } = useFullscreen();
  const idle = useIdle(IDLE_MS);
  const reducedMotion = usePrefersReducedMotion();
  const [qrExpanded, setQrExpanded] = useState(false);

  const title = settings.headline || headline || eventName;
  const invite = settingsLoading ? "none" : settings.state;
  const displayUrl = uploadUrl.replace(/^https?:\/\//, "");

  const wallPhotos = useMemo(
    () =>
      photos.filter(
        (p) => ready.has(p.id) && !broken.has(p.id) && !spotlight.held.has(p.id)
      ),
    [photos, ready, broken, spotlight.held]
  );

  const visibleCount = useMemo(
    () => photos.filter((p) => !broken.has(p.id)).length,
    [photos, broken]
  );

  const aspects = useMemo(() => {
    const map = new Map<string, number>();
    for (const photo of wallPhotos) {
      const natural = ready.get(photo.id);
      map.set(
        photo.id,
        photoAspect(
          natural?.width || photo.width,
          natural?.height || photo.height
        )
      );
    }
    return map;
  }, [wallPhotos, ready]);

  const empty = !loading && photos.every((p) => broken.has(p.id));
  const waiting = !empty && (!settled || wallPhotos.length === 0);
  const canExpandQr = !empty && invite === "open" && Boolean(qrDataUrl);
  const isQrOpen = qrExpanded && canExpandQr;
  const closeQr = useCallback(() => setQrExpanded(false), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        void toggle();
      } else if (key === "q" && canExpandQr) {
        setQrExpanded((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, canExpandQr]);
  const controls = `transition-opacity duration-300 ${
    idle ? "pointer-events-none opacity-0" : "opacity-100"
  }`;

  const hudCard =
    "rounded-2xl border border-white/15 bg-black/75 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl";

  return (
    <div
      className={`relative h-dvh overflow-hidden bg-black text-[#f4f4ee] ${
        idle ? "cursor-none" : ""
      }`}
      data-immersive={immersive || undefined}
    >
      {empty ? (
        invite === "open" ? (
          <div className="flex h-full flex-col pt-20">
            <HeroQr
              qrDataUrl={qrDataUrl}
              url={displayUrl}
              caption="Escanea y sube tu primera foto"
              alt="QR para subir fotos al mural"
            />
          </div>
        ) : (
          <main className="flex h-full items-center justify-center p-8 text-center">
            <p className="text-2xl text-white/70">
              {invite === "paused"
                ? "Las subidas están en pausa un momento."
                : "Aquí aparecerán las fotos del evento."}
            </p>
          </main>
        )
      ) : (
        <main className="absolute inset-0">
          {waiting ? (
            <p className="flex h-full items-center justify-center text-xl text-white/55">
              Cargando fotos…
            </p>
          ) : (
            <>
              <RibbonWall
                photos={wallPhotos}
                aspects={aspects}
                reducedMotion={reducedMotion}
                paused={Boolean(spotlight.current) || isQrOpen}
                inset={reducedMotion && !immersive}
                onBroken={markBroken}
              />
              {/* Soft pure-black edge vignette so columns emerge cleanly */}
              <div
                aria-hidden="true"
                className="mural-vignette pointer-events-none absolute inset-0 z-10"
              />
            </>
          )}

          {spotlight.current && (
            <Spotlight
              photo={spotlight.current}
              aspect={naturalAspect(
                ready.get(spotlight.current.id),
                spotlight.current
              )}
              leaving={spotlight.leaving}
            />
          )}
        </main>
      )}

      {!immersive && (
        <header className="absolute top-6 right-6 left-6 z-20 flex items-start gap-4">
          <div
            className={`flex min-w-0 items-center gap-4 px-5 py-3 ${hudCard}`}
          >
            <img src="/gdg-logo.png" alt="GDG ICA" className="h-9 w-auto" />
            <div className="min-w-0">
              <h1 className="m-0 line-clamp-2 font-(family-name:--font-display) text-2xl leading-tight font-bold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              {visibleCount > 0 && (
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-white/65 tabular-nums">
                  <CameraIcon size={13} className="text-(--ochre)" />
                  <span>
                    {visibleCount} foto{visibleCount !== 1 ? "s" : ""} en vivo
                  </span>
                </p>
              )}
            </div>
          </div>

          <div
            className={`ml-auto flex shrink-0 items-center gap-2 ${controls}`}
          >
            {canExpandQr && (
              <button
                type="button"
                onClick={() => setQrExpanded(true)}
                aria-label="Agrandar QR"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-4 py-2.5 text-sm font-medium text-white/85 backdrop-blur-xl transition-colors hover:border-white/35 hover:bg-black/90"
              >
                <QrIcon size={16} />
                <span>QR</span>
                <kbd className="hidden rounded border border-white/25 px-1.5 font-mono text-xs text-white/65 sm:inline">
                  Q
                </kbd>
              </button>
            )}

            <button
              type="button"
              onClick={() => void toggle()}
              className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/75 px-4 py-2.5 text-sm font-medium text-white/85 backdrop-blur-xl transition-colors hover:border-white/35 hover:bg-black/90 sm:flex"
            >
              <FullscreenIcon size={16} exit={false} />
              Pantalla completa
              <kbd className="rounded border border-white/25 px-1.5 font-mono text-xs text-white/65">
                F
              </kbd>
            </button>
          </div>
        </header>
      )}

      {!empty && !immersive && invite === "open" && (
        <footer className={`absolute right-6 bottom-6 z-20 ${hudCard}`}>
          <button
            type="button"
            onClick={() => setQrExpanded(true)}
            aria-label="Ampliar QR del mural"
            className="group flex cursor-pointer items-center gap-5 rounded-2xl p-3 pl-6 text-right transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ochre)"
          >
            <div>
              <p className="font-(family-name:--font-display) text-xl font-bold text-white">
                Sube tu foto
              </p>
              <p className="mt-0.5 font-mono text-sm text-white/75">
                {displayUrl}
              </p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-white/80 transition-colors group-hover:border-(--ochre)/50 group-hover:text-(--ochre)">
                <ExpandIcon size={12} />
                Ampliar · Q
              </span>
            </div>
            <img
              src={qrDataUrl}
              alt="QR para subir fotos al mural"
              className="h-32 w-32 rounded-xl bg-white p-1.5 transition-transform group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          </button>
        </footer>
      )}

      {!empty && !immersive && invite === "paused" && (
        <footer className="absolute right-6 bottom-6 z-20">
          <p className="rounded-full border border-white/15 bg-black/75 px-4 py-2 font-mono text-sm text-white/80 backdrop-blur-xl">
            Subidas en pausa
          </p>
        </footer>
      )}

      {!empty && immersive && invite === "open" && (
        <aside className={`absolute right-6 bottom-6 z-30 ${hudCard}`}>
          <button
            type="button"
            onClick={() => setQrExpanded(true)}
            aria-label="Ampliar QR del mural"
            className="group flex cursor-pointer flex-col items-center gap-2 rounded-2xl p-3 transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ochre)"
          >
            <img
              src={qrDataUrl}
              alt="QR para subir fotos al mural"
              className="h-[15vh] w-[15vh] rounded-xl bg-white p-1.5 transition-transform group-hover:scale-[1.03] motion-reduce:transition-none"
            />
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-white/85 uppercase group-hover:text-(--ochre)">
              Sube tu foto
              <ExpandIcon size={12} />
            </span>
          </button>
        </aside>
      )}

      {!empty && immersive && invite === "paused" && (
        <p className="absolute right-6 bottom-6 z-30 rounded-full border border-white/15 bg-black/75 px-4 py-2 font-mono text-sm text-white/80 backdrop-blur-xl">
          Subidas en pausa
        </p>
      )}

      {!empty && immersive && (
        <div
          className={`absolute top-5 right-5 z-30 flex items-center gap-2 ${controls}`}
        >
          {canExpandQr && (
            <button
              type="button"
              onClick={() => setQrExpanded(true)}
              aria-label="Agrandar QR"
              className="flex items-center gap-2 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-sm text-white/85 backdrop-blur-xl transition-colors hover:bg-black/90"
            >
              <QrIcon size={16} />
              <span>QR</span>
              <kbd className="rounded border border-white/25 px-1.5 font-mono text-xs text-white/65">
                Q
              </kbd>
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggle()}
            aria-label="Salir de pantalla completa"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-sm text-white/85 backdrop-blur-xl transition-colors hover:bg-black/90"
          >
            <FullscreenIcon size={16} exit />
            Salir
          </button>
        </div>
      )}

      <QrLightbox
        open={isQrOpen}
        qrDataUrl={qrDataUrl}
        url={uploadUrl}
        caption="Sube tu foto al mural"
        subtitle={title}
        alt="QR ampliado para subir fotos al mural"
        onClose={closeQr}
      />
    </div>
  );
}

export default MuralProjectorView;
