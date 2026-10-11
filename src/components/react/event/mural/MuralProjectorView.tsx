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

  return (
    <div
      className={`flex h-dvh flex-col overflow-hidden bg-black text-white ${
        idle ? "cursor-none" : ""
      }`}
      data-immersive={immersive || undefined}
    >
      {!immersive && (
        <header className="flex items-center gap-5 px-8 pt-6 pb-4">
          <img src="/gdg-logo.png" alt="GDG ICA" className="h-10 w-auto" />
          <h1 className="line-clamp-2 flex-1 text-3xl leading-tight font-semibold">
            {title}
          </h1>
          <button
            type="button"
            onClick={() => void toggle()}
            className={`flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10 ${controls}`}
          >
            <FullscreenIcon exit={false} />
            Pantalla completa
            <kbd className="rounded border border-white/30 px-1.5 text-xs">
              F
            </kbd>
          </button>
        </header>
      )}

      {empty ? (
        invite === "open" ? (
          <HeroQr
            qrDataUrl={qrDataUrl}
            url={displayUrl}
            caption="Escanea y sube tu primera foto"
            alt="QR para subir fotos al mural"
          />
        ) : (
          <main className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-2xl text-white/70">
              {invite === "paused"
                ? "Las subidas están en pausa un momento."
                : "Aquí aparecerán las fotos del evento."}
            </p>
          </main>
        )
      ) : (
        <main className="relative min-h-0 flex-1">
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

          {immersive && invite === "open" && (
            <aside className="absolute right-6 bottom-6 z-30 flex flex-col items-center gap-2 rounded-2xl bg-black/70 p-3 backdrop-blur">
              <img
                src={qrDataUrl}
                alt="QR para subir fotos al mural"
                className="h-[15vh] w-[15vh] rounded-lg bg-white p-1.5"
              />
              <p className="text-sm font-medium">Sube tu foto</p>
            </aside>
          )}

          {immersive && invite === "paused" && (
            <p className="absolute right-6 bottom-6 z-30 rounded-full bg-black/70 px-4 py-2 text-sm text-white/80">
              Subidas en pausa
            </p>
          )}

          {immersive && (
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
        </main>
      )}

      {!immersive && !empty && invite === "open" && (
        <footer className="flex items-center justify-end gap-5 px-8 pt-4 pb-6">
          <div className="text-right">
            <p className="text-lg font-medium">Sube tu foto</p>
            <p className="text-white/60">{displayUrl}</p>
          </div>
          <img
            src={qrDataUrl}
            alt="QR para subir fotos al mural"
            className="h-32 w-32 rounded-lg bg-white p-1.5"
          />
        </footer>
      )}

      {!immersive && !empty && invite === "paused" && (
        <footer className="flex justify-end px-8 pt-4 pb-6">
          <p className="rounded-full bg-white/10 px-4 py-2 text-white/80">
            Subidas en pausa
          </p>
        </footer>
      )}
    </div>
  );
}

export default MuralProjectorView;
