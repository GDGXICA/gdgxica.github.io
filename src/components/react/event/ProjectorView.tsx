import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { TYPE_LABELS } from "../admin/minigame-templates/types";
import { HeroQr } from "./HeroQr";
import { TYPE_DOTS } from "./JoinModal";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExpandIcon,
  FullscreenIcon,
  GameTypeIcon,
  QrIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from "./icons";
import { QrLightbox } from "./QrLightbox";
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

  const closeQr = useCallback(() => setQrExpanded(false), []);

  useEffect(() => {
    setFocusMode(false);
  }, [gameId]);

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
        void toggleFullscreen();
      } else if (key === "q" && selectedQr) {
        setQrExpanded((prev) => !prev);
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

          {(selectedQr || hasActiveGame) && (
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

      {!gameId && (
        <main className="mx-auto flex w-full max-w-[1440px] flex-1 items-center px-5 py-8 sm:px-8 lg:py-12">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,430px)] lg:gap-14">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-mono text-xs font-semibold tracking-[0.22em] text-(--ochre) uppercase sm:text-sm">
                  Panel de proyección
                </p>
                {liveInstances.length > 0 && (
                  <span className="bg-google-green/15 inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 font-mono text-xs text-green-300">
                    <span
                      className="bg-google-green h-1.5 w-1.5 rounded-full"
                      aria-hidden="true"
                    />
                    {liveInstances.length}{" "}
                    {liveInstances.length === 1 ? "activa" : "activas"}
                  </span>
                )}
              </div>

              <h2 className="mt-3 font-(family-name:--font-display) text-3xl leading-[1.06] font-bold tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
                Elige una dinámica para proyectar
              </h2>

              <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/65 sm:text-base">
                <span>Enlace para participantes:</span>
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1 font-mono text-xs break-all text-white sm:text-sm">
                  {joinUrl}
                </span>
              </p>

              {liveInstances.length === 0 ? (
                <div className="mt-8 rounded-3xl border border-dashed border-white/20 bg-[#07090e] px-8 py-14 text-center">
                  <p className="text-xl text-white/75 sm:text-2xl">
                    Cuando una dinámica esté en vivo, aparecerá aquí.
                  </p>
                </div>
              ) : (
                <div
                  className={`mt-8 grid gap-4 ${
                    liveInstances.length > 4 ? "sm:grid-cols-2" : "grid-cols-1"
                  }`}
                >
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
                      className="group relative flex items-center justify-between gap-5 overflow-hidden rounded-3xl border border-white/15 bg-[#0b0d13] px-6 py-5 pl-7 text-white no-underline transition-all hover:border-white/40 hover:bg-[#111521] sm:px-7 sm:py-6 sm:pl-8"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-1.5"
                        style={{ backgroundColor: TYPE_DOTS[item.type] }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.16em] text-white/75 uppercase">
                            <GameTypeIcon
                              type={item.type}
                              size={16}
                              style={{ color: TYPE_DOTS[item.type] }}
                            />
                            {TYPE_LABELS[item.type]}
                          </span>
                          <span className="bg-google-green/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] text-green-300">
                            <span
                              className="bg-google-green h-1.5 w-1.5 rounded-full"
                              aria-hidden="true"
                            />
                            En vivo
                          </span>
                        </div>
                        <p className="mt-2.5 font-(family-name:--font-display) text-2xl leading-tight font-bold break-words text-white sm:text-3xl">
                          {item.title}
                        </p>
                      </div>
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-(--ochre) transition-all group-hover:translate-x-1 group-hover:border-(--ochre)/60 group-hover:bg-(--ochre)/15 motion-reduce:transition-none">
                        <ArrowRightIcon size={20} />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {selectedQr && (
              <aside className="rounded-[2rem] border border-white/15 bg-[#0b0d13] p-6 text-center shadow-[0_32px_90px_-24px_rgba(0,0,0,0.95)] sm:p-7">
                <div
                  aria-hidden="true"
                  className="mb-5 flex h-1.5 w-full overflow-hidden rounded-full"
                >
                  <span className="bg-google-blue flex-1" />
                  <span className="bg-google-red flex-1" />
                  <span className="bg-google-yellow flex-1" />
                  <span className="bg-google-green flex-1" />
                </div>

                <p className="font-mono text-xs font-semibold tracking-[0.22em] text-(--ochre) uppercase sm:text-sm">
                  Únete ahora
                </p>
                <p className="mt-1 text-sm text-white/65">
                  Escanea con tu celular para participar
                </p>

                <button
                  type="button"
                  onClick={() => setQrExpanded(true)}
                  aria-label="Ampliar código QR"
                  className="group relative mx-auto mt-5 block aspect-square w-full max-w-[300px] cursor-pointer rounded-2xl bg-white p-4 transition-transform hover:scale-[1.015] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--ochre) motion-reduce:transition-none"
                >
                  <img
                    src={selectedQr}
                    alt="QR para unirse a los juegos"
                    className="h-full w-full object-contain"
                  />
                </button>

                <p className="mt-4 font-mono text-xs break-all text-white/80 sm:text-sm">
                  {joinUrl.replace(/^https?:\/\//, "")}
                </p>

                <button
                  type="button"
                  onClick={() => setQrExpanded(true)}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.05] px-4 text-sm font-medium text-white transition-colors hover:border-white/45 hover:bg-white/12"
                >
                  <ExpandIcon size={16} className="text-(--ochre)" />
                  <span>Ampliar QR</span>
                  <kbd className="rounded border border-white/25 px-1.5 font-mono text-[11px] text-white/70">
                    Q
                  </kbd>
                </button>
              </aside>
            )}
          </div>
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
              <ProjectorPoll
                key={activeInstance.id}
                slug={slug}
                instance={activeInstance}
              />
            )}
            {activeInstance.type === "quiz" && activeInstance.config && (
              <ProjectorQuiz
                key={activeInstance.id}
                slug={slug}
                instance={activeInstance}
                onFocusModeChange={setFocusMode}
              />
            )}
            {activeInstance.type === "wordcloud" && (
              <ProjectorWordCloud
                key={activeInstance.id}
                slug={slug}
                instance={activeInstance}
              />
            )}
            {activeInstance.type === "bingo" && (
              <ProjectorBingo
                key={activeInstance.id}
                slug={slug}
                instance={activeInstance}
              />
            )}
            {activeInstance.type === "roulette" && (
              <ProjectorRoulette
                key={activeInstance.id}
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

      {selectedQr && (
        <QrLightbox
          open={qrExpanded}
          qrDataUrl={selectedQr}
          url={selectedJoinUrl}
          caption="Escanea para unirte"
          subtitle={activeInstance ? activeInstance.title : eventName}
          alt="QR de unión ampliado"
          onClose={closeQr}
        />
      )}
    </div>
  );
}

export default ProjectorView;
