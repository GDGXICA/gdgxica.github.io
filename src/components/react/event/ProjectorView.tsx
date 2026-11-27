import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { TYPE_LABELS } from "../admin/minigame-templates/types";
import { HeroQr } from "./HeroQr";
import { TYPE_DOTS } from "./JoinModal";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  FullscreenIcon,
  GameTypeIcon,
  QrIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from "./icons";
import { useFullscreen } from "./mural/useFullscreen";
import { useIdle } from "./mural/useIdle";
import { ProjectorBingo } from "./projector/ProjectorBingo";
import { ProjectorPoll } from "./projector/ProjectorPoll";
import { ProjectorQuiz } from "./projector/ProjectorQuiz";
import { ProjectorRoulette } from "./projector/ProjectorRoulette";
import { ProjectorWordCloud } from "./projector/ProjectorWordCloud";
import { isStageAudioEnabled, setStageAudioEnabled } from "./stageAudio";
import { navigateToGame, useGameId } from "./useGameId";
import { useLiveMinigames } from "./useLiveMinigames";
import { useMinigameInstance } from "./useMinigameInstance";

interface Props {
  slug: string;
  eventName: string;
  joinUrl: string;
  qrDataUrl: string;
}

export function ProjectorView({ slug, eventName, joinUrl, qrDataUrl }: Props) {
  const gameId = useGameId();
  const { liveInstances } = useLiveMinigames(!gameId ? slug : null);
  const { instance: singleInstance } = useMinigameInstance(
    gameId ? slug : null,
    gameId
  );
  const { immersive, toggle: toggleFullscreen } = useFullscreen();
  const idle = useIdle(3500);

  const [qrExpanded, setQrExpanded] = useState(false);
  const [audioOn, setAudioOn] = useState(() => isStageAudioEnabled());
  const [focusMode, setFocusMode] = useState(false);

  const selectedJoinUrl = gameId
    ? `${joinUrl}?game=${encodeURIComponent(gameId)}`
    : joinUrl;
  const [qr, setQr] = useState({ url: joinUrl, data: qrDataUrl });
  const [qrError, setQrError] = useState(false);
  const selectedQr = qr.url === selectedJoinUrl ? qr.data : null;

  useEffect(() => {
    if (selectedJoinUrl === joinUrl && qrDataUrl) {
      setQr({ url: joinUrl, data: qrDataUrl });
      setQrError(false);
      return;
    }
    let cancelled = false;
    setQrError(false);
    QRCode.toDataURL(selectedJoinUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 512,
    })
      .then((data) => {
        if (!cancelled) setQr({ url: selectedJoinUrl, data });
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedJoinUrl, joinUrl, qrDataUrl]);

  // Keyboard shortcuts for presenter: F fullscreen, Q toggle QR, Escape closes QR.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        void toggleFullscreen();
      } else if (key === "q" && selectedQr) {
        setQrExpanded((prev) => !prev);
      } else if (key === "escape") {
        setQrExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, selectedQr]);

  const handleToggleAudio = useCallback(() => {
    const next = setStageAudioEnabled(!audioOn);
    setAudioOn(next);
  }, [audioOn]);

  const visible = useMemo(() => {
    if (!gameId || !singleInstance) return [];
    const isRenderable =
      singleInstance.mode === "global" ||
      (singleInstance.mode === "realtime" && singleInstance.config);
    return isRenderable ? [singleInstance] : [];
  }, [gameId, singleInstance]);

  const hasActiveGame = visible.length > 0;
  const activeInstance = visible[0] ?? null;
  const hideCornerQr = focusMode || activeInstance?.state === "closed";

  return (
    <div
      className={`flex min-h-dvh flex-col bg-black text-[#f4f4ee] ${
        immersive && idle ? "cursor-none" : ""
      }`}
    >
      {/* Top Presenter HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/12 px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <img
            src="/gdg-logo.png"
            width={34}
            height={34}
            alt=""
            className="h-8 w-8 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="m-0 truncate font-(family-name:--font-display) text-xl leading-none font-bold tracking-tight text-white sm:text-2xl">
              {eventName}
            </h1>
            <p className="mt-1 flex items-center gap-2 font-mono text-xs text-white/60">
              <span
                className="bg-google-green h-2 w-2 shrink-0 rounded-full"
                aria-hidden="true"
              />
              GDG ICA · En vivo
            </p>
          </div>
        </div>

        {/* Presenter controls (never game mutations) */}
        <div
          className={`flex flex-wrap items-center gap-2 transition-opacity duration-300 ${
            immersive && idle ? "opacity-0" : "opacity-100"
          }`}
        >
          {gameId && (
            <button
              type="button"
              onClick={() => navigateToGame(null)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 text-sm font-medium text-white/85 transition-colors hover:border-white/35 hover:bg-white/10"
            >
              <ArrowLeftIcon size={16} />
              <span className="hidden sm:inline">Dinámicas</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleAudio}
            aria-pressed={audioOn}
            aria-label={audioOn ? "Silenciar sonido" : "Activar sonido"}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${
              audioOn
                ? "border-(--ochre)/60 bg-(--ochre)/15 text-(--ochre)"
                : "border-white/15 bg-white/[0.04] text-white/75 hover:border-white/35 hover:text-white"
            }`}
          >
            {audioOn ? <VolumeOnIcon size={16} /> : <VolumeOffIcon size={16} />}
            <span className="hidden md:inline">
              {audioOn ? "Sonido activo" : "Sonido"}
            </span>
          </button>

          {hasActiveGame && (
            <button
              type="button"
              onClick={() => setQrExpanded(true)}
              disabled={!selectedQr}
              aria-label="Agrandar QR"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 text-sm font-medium text-white/85 transition-colors hover:border-white/35 hover:bg-white/10 disabled:opacity-45"
            >
              <QrIcon size={16} />
              <span className="hidden sm:inline">QR</span>
              <kbd className="hidden rounded border border-white/25 px-1.5 font-mono text-[11px] text-white/60 lg:inline">
                Q
              </kbd>
            </button>
          )}

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={
              immersive ? "Salir de pantalla completa" : "Pantalla completa"
            }
            className="hidden min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 text-sm font-medium text-white/85 transition-colors hover:border-white/35 hover:bg-white/10 sm:inline-flex"
          >
            <FullscreenIcon size={16} exit={immersive} />
            <kbd className="rounded border border-white/25 px-1.5 font-mono text-[11px] text-white/60">
              F
            </kbd>
          </button>
        </div>
      </header>

      {/* Lobby selector when no ?game= */}
      {!gameId && (
        <main className="mx-auto grid w-full max-w-[1480px] flex-1 items-start gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
          <div>
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-(--ochre) uppercase sm:text-sm">
              Panel de proyección
            </p>
            <h2 className="mt-2 font-(family-name:--font-display) text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Elige una dinámica para proyectar
            </h2>
            <p className="mt-3 text-base text-white/65 sm:text-lg">
              Enlace para participantes:{" "}
              <span className="font-mono break-all text-white">{joinUrl}</span>
            </p>

            {liveInstances.length === 0 ? (
              <div className="mt-10 rounded-3xl border border-dashed border-white/20 bg-[#07090e] px-8 py-14 text-center">
                <p className="text-xl text-white/75 sm:text-2xl">
                  Cuando una dinámica esté en vivo, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {liveInstances.map((item) => (
                  <a
                    key={item.id}
                    href={`?game=${encodeURIComponent(item.id)}`}
                    onClick={(e) => {
                      if (
                        e.metaKey ||
                        e.ctrlKey ||
                        e.shiftKey ||
                        e.altKey ||
                        e.button !== 0
                      ) {
                        return;
                      }
                      e.preventDefault();
                      navigateToGame(item.id);
                    }}
                    className="group relative flex min-h-36 flex-col justify-between overflow-hidden rounded-3xl border border-white/15 bg-[#0b0d13] p-6 text-white no-underline transition-colors hover:border-white/40 hover:bg-[#121622]"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ backgroundColor: TYPE_DOTS[item.type] }}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">
                        <GameTypeIcon
                          type={item.type}
                          size={16}
                          style={{ color: TYPE_DOTS[item.type] }}
                        />
                        {TYPE_LABELS[item.type]}
                      </span>
                      <span className="bg-google-green/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs text-green-300">
                        <span
                          className="bg-google-green h-1.5 w-1.5 rounded-full"
                          aria-hidden="true"
                        />
                        En vivo
                      </span>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-4">
                      <span className="font-(family-name:--font-display) text-2xl leading-tight font-bold break-words sm:text-3xl">
                        {item.title}
                      </span>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 text-(--ochre) transition-transform group-hover:translate-x-1 motion-reduce:transition-none">
                        <ArrowRightIcon size={18} />
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Side QR Panel in Lobby */}
          {selectedQr && (
            <aside className="rounded-3xl border border-white/15 bg-[#0b0d13] p-6 text-center">
              <p className="font-mono text-xs font-semibold tracking-[0.2em] text-(--ochre) uppercase">
                Únete ahora
              </p>
              <div className="mx-auto mt-4 aspect-square w-full max-w-[260px] rounded-2xl bg-white p-3">
                <img
                  src={selectedQr}
                  alt="QR para unirse a los juegos"
                  className="h-full w-full object-contain"
                />
              </div>
              <p className="mt-4 font-mono text-xs break-all text-white/75">
                {joinUrl.replace(/^https?:\/\//, "")}
              </p>
            </aside>
          )}
        </main>
      )}

      {/* Selected ?game= but still scheduled/waiting */}
      {gameId && !hasActiveGame && selectedQr && (
        <HeroQr
          qrDataUrl={selectedQr}
          url={selectedJoinUrl}
          caption="Escanea para participar"
          subtitle="La dinámica aparecerá automáticamente en cuanto comience."
        />
      )}
      {gameId && !hasActiveGame && !selectedQr && (
        <main className="flex flex-1 items-center justify-center text-xl text-white/70">
          {qrError
            ? "No se pudo generar el QR. Comparte el enlace mostrado arriba."
            : "Preparando QR…"}
        </main>
      )}

      {/* Active or Closed Game Stage */}
      {hasActiveGame && activeInstance && (
        <main className="mx-auto flex w-full max-w-[1520px] flex-1 flex-col px-5 py-6 sm:px-8 sm:py-8">
          <article className="flex min-w-0 flex-1 flex-col">
            {activeInstance.type === "poll" && activeInstance.config && (
              <ProjectorPoll slug={slug} instance={activeInstance} />
            )}
            {activeInstance.type === "quiz" && activeInstance.config && (
              <ProjectorQuiz
                slug={slug}
                instance={activeInstance}
                onFocusModeChange={setFocusMode}
              />
            )}
            {activeInstance.type === "wordcloud" && (
              <ProjectorWordCloud slug={slug} instance={activeInstance} />
            )}
            {activeInstance.type === "bingo" && (
              <ProjectorBingo slug={slug} instance={activeInstance} />
            )}
            {activeInstance.type === "roulette" && (
              <ProjectorRoulette
                slug={slug}
                instance={activeInstance}
                onFocusModeChange={setFocusMode}
              />
            )}
          </article>
        </main>
      )}

      {/* Compact QR footer during active games (hidden during climax/podium) */}
      {hasActiveGame && !hideCornerQr && (
        <footer className="border-t border-white/12 bg-black px-5 py-3 sm:px-8">
          <div className="mx-auto flex max-w-[1520px] flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="max-w-full min-w-0 text-center text-sm font-medium text-white/80 sm:text-left sm:text-base">
              ¿Quieres participar? Escanea el QR ·{" "}
              <span className="font-mono text-xs break-all text-white/60 sm:text-sm">
                {selectedJoinUrl}
              </span>
            </p>
            {selectedQr && (
              <button
                type="button"
                onClick={() => setQrExpanded(true)}
                className="flex shrink-0 items-center gap-3 rounded-xl border border-white/15 bg-[#0b0d13] p-1.5 pr-3 text-left transition-colors hover:border-white/40"
                aria-label="Ampliar QR del pie"
              >
                <img
                  src={selectedQr}
                  alt=""
                  className="h-16 w-16 rounded-lg bg-white p-1"
                />
                <span className="font-mono text-xs text-white/75">
                  Clic o <kbd className="text-(--ochre)">Q</kbd>
                  <br />
                  para ampliar
                </span>
              </button>
            )}
          </div>
        </footer>
      )}

      {/* Fullscreen QR Overlay */}
      {qrExpanded && selectedQr && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 p-6 backdrop-blur-sm sm:p-8"
          onClick={() => setQrExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label="QR ampliado"
        >
          <button
            type="button"
            onClick={() => setQrExpanded(false)}
            className="absolute top-5 right-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-black/80 px-4 text-sm font-medium text-white hover:bg-white/10 sm:top-6 sm:right-8"
            aria-label="Cerrar QR grande"
          >
            <CloseIcon size={16} />
            Cerrar
          </button>
          <p className="font-mono text-sm tracking-[0.2em] text-(--ochre) uppercase">
            Escanea para unirte
          </p>
          <div className="aspect-square w-full max-w-[min(58vh,560px)] rounded-3xl bg-white p-5 sm:p-6">
            <img
              src={selectedQr}
              alt="QR de unión ampliado"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="max-w-full rounded-full border border-white/15 bg-white/[0.05] px-5 py-2 text-center font-mono text-sm break-all text-white/90 sm:text-xl">
            {selectedJoinUrl}
          </p>
        </div>
      )}
    </div>
  );
}

export default ProjectorView;
