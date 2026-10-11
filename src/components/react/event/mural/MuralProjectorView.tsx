import { useEffect, useMemo } from "react";
import type { MuralPhoto } from "@/lib/mural";
import { HeroQr } from "../HeroQr";
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

function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {exit ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  );
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

  const card = "rounded-2xl bg-black/55 backdrop-blur-md";

  return (
    <div
      className={`relative h-dvh overflow-hidden bg-black text-white ${
        idle ? "cursor-none" : ""
      }`}
      data-immersive={immersive || undefined}
    >
      {empty ? (
        invite === "open" ? (
          <HeroQr
            qrDataUrl={qrDataUrl}
            url={displayUrl}
            caption="Escanea y sube tu primera foto"
            alt="QR para subir fotos al mural"
          />
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
            <p className="flex h-full items-center justify-center text-xl text-white/50">
              Cargando fotos…
            </p>
          ) : (
            <RibbonWall
              photos={wallPhotos}
              aspects={aspects}
              reducedMotion={reducedMotion}
              paused={Boolean(spotlight.current)}
              inset={reducedMotion && !immersive}
              onBroken={markBroken}
            />
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
          <div className={`flex min-w-0 items-center gap-4 px-5 py-3 ${card}`}>
            <img src="/gdg-logo.png" alt="GDG ICA" className="h-10 w-auto" />
            <h1 className="line-clamp-2 text-3xl leading-tight font-semibold">
              {title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void toggle()}
            className={`ml-auto hidden shrink-0 items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm text-white/80 backdrop-blur-md hover:bg-black/75 sm:flex ${controls}`}
          >
            <FullscreenIcon exit={false} />
            Pantalla completa
            <kbd className="rounded border border-white/30 px-1.5 text-xs">
              F
            </kbd>
          </button>
        </header>
      )}

      {!empty && !immersive && invite === "open" && (
        <footer
          className={`absolute right-6 bottom-6 z-20 flex items-center gap-5 p-3 pl-6 ${card}`}
        >
          <div className="text-right">
            <p className="text-lg font-medium">Sube tu foto</p>
            <p className="text-white/70">{displayUrl}</p>
          </div>
          <img
            src={qrDataUrl}
            alt="QR para subir fotos al mural"
            className="h-32 w-32 rounded-lg bg-white p-1.5"
          />
        </footer>
      )}

      {!empty && !immersive && invite === "paused" && (
        <footer className="absolute right-6 bottom-6 z-20">
          <p className="rounded-full bg-black/55 px-4 py-2 text-white/80 backdrop-blur-md">
            Subidas en pausa
          </p>
        </footer>
      )}

      {!empty && immersive && invite === "open" && (
        <aside
          className={`absolute right-6 bottom-6 z-30 flex flex-col items-center gap-2 p-3 ${card}`}
        >
          <img
            src={qrDataUrl}
            alt="QR para subir fotos al mural"
            className="h-[15vh] w-[15vh] rounded-lg bg-white p-1.5"
          />
          <p className="text-sm font-medium">Sube tu foto</p>
        </aside>
      )}

      {!empty && immersive && invite === "paused" && (
        <p className="absolute right-6 bottom-6 z-30 rounded-full bg-black/55 px-4 py-2 text-sm text-white/80 backdrop-blur-md">
          Subidas en pausa
        </p>
      )}

      {!empty && immersive && (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label="Salir de pantalla completa"
          className={`absolute top-5 right-5 z-30 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white/80 hover:bg-black/80 ${controls}`}
        >
          <FullscreenIcon exit />
          Salir
        </button>
      )}
    </div>
  );
}

export default MuralProjectorView;
