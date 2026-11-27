import { useEffect, useMemo } from "react";
import type { MuralPhoto } from "@/lib/mural";
import { HeroQr } from "../HeroQr";
import { CameraIcon, FullscreenIcon } from "../icons";
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        return;
      }
      void toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

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
                paused={Boolean(spotlight.current)}
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

          <button
            type="button"
            onClick={() => void toggle()}
            className={`ml-auto hidden shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/75 px-4 py-2.5 text-sm font-medium text-white/85 backdrop-blur-xl hover:border-white/35 hover:bg-black/90 sm:flex ${controls}`}
          >
            <FullscreenIcon size={16} exit={false} />
            Pantalla completa
            <kbd className="rounded border border-white/25 px-1.5 font-mono text-xs text-white/65">
              F
            </kbd>
          </button>
        </header>
      )}

      {!empty && !immersive && invite === "open" && (
        <footer
          className={`absolute right-6 bottom-6 z-20 flex items-center gap-5 p-3 pl-6 ${hudCard}`}
        >
          <div className="text-right">
            <p className="font-(family-name:--font-display) text-xl font-bold text-white">
              Sube tu foto
            </p>
            <p className="mt-0.5 font-mono text-sm text-white/75">
              {displayUrl}
            </p>
          </div>
          <img
            src={qrDataUrl}
            alt="QR para subir fotos al mural"
            className="h-32 w-32 rounded-xl bg-white p-1.5"
          />
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
        <aside
          className={`absolute right-6 bottom-6 z-30 flex flex-col items-center gap-2 p-3 ${hudCard}`}
        >
          <img
            src={qrDataUrl}
            alt="QR para subir fotos al mural"
            className="h-[15vh] w-[15vh] rounded-xl bg-white p-1.5"
          />
          <p className="font-mono text-xs font-semibold tracking-wider text-white/85 uppercase">
            Sube tu foto
          </p>
        </aside>
      )}

      {!empty && immersive && invite === "paused" && (
        <p className="absolute right-6 bottom-6 z-30 rounded-full border border-white/15 bg-black/75 px-4 py-2 font-mono text-sm text-white/80 backdrop-blur-xl">
          Subidas en pausa
        </p>
      )}

      {!empty && immersive && (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label="Salir de pantalla completa"
          className={`absolute top-5 right-5 z-30 flex items-center gap-2 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-sm text-white/85 backdrop-blur-xl hover:bg-black/90 ${controls}`}
        >
          <FullscreenIcon size={16} exit />
          Salir
        </button>
      )}
    </div>
  );
}

export default MuralProjectorView;
