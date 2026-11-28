import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import {
  clearStoredGuestSession,
  ensureMinigameSession,
  getStoredGuestSession,
} from "@/lib/guestSession";
import type { PollConfig, QuizConfig } from "../admin/minigame-templates/types";
import { TYPE_LABELS } from "../admin/minigame-templates/types";
import { JoinModal, TYPE_DOTS } from "./JoinModal";
import { ArrowLeftIcon, ArrowRightIcon, GameTypeIcon } from "./icons";
import { LOCAL_STORAGE_ALIAS_KEY } from "./types";
import { navigateToGame, useGameId } from "./useGameId";
import { useLiveMinigames } from "./useLiveMinigames";
import { useMinigameInstance } from "./useMinigameInstance";

const BingoCardView = lazy(() =>
  import("./BingoCardView").then((m) => ({ default: m.BingoCardView }))
);
const PollOverlay = lazy(() =>
  import("./PollOverlay").then((m) => ({ default: m.PollOverlay }))
);
const QuizOverlay = lazy(() =>
  import("./QuizOverlay").then((m) => ({ default: m.QuizOverlay }))
);
const RouletteView = lazy(() =>
  import("./RouletteView").then((m) => ({ default: m.RouletteView }))
);
const WordCloudView = lazy(() =>
  import("./WordCloudView").then((m) => ({ default: m.WordCloudView }))
);

interface Props {
  slug: string;
  eventName: string;
}

export function GameParticipantRoot({ slug, eventName }: Props) {
  const gameId = useGameId();
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [alias, setAlias] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_ALIAS_KEY(slug));
    } catch {
      return null;
    }
  });
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [justJoinedId, setJustJoinedId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joiningRef = useRef(false);

  const {
    liveInstances,
    loading: listLoading,
    error: listError,
  } = useLiveMinigames(!gameId ? slug : null);
  const {
    instance: singleInstance,
    loading: singleLoading,
    error: singleError,
  } = useMinigameInstance(gameId ? slug : null, gameId);

  const instance = gameId ? (singleInstance ?? undefined) : undefined;
  const loading = gameId ? singleLoading : listLoading;
  const error = gameId ? singleError : listError;
  const isClosed = instance?.state === "closed";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const guest = await ensureMinigameSession(slug);
        if (guest) {
          if (!cancelled) {
            setUid(guest.uid);
            setAuthReady(true);
          }
          return;
        }
        const user = await signInAnonymouslyIfNeeded();
        if (!cancelled) {
          setUid(user?.uid ?? null);
          if (!user) {
            setAuthError(
              "No pudimos iniciar la sesión del juego. Recarga la página."
            );
          }
          setAuthReady(true);
        }
      } catch {
        if (!cancelled) {
          setAuthError(
            "No pudimos iniciar la sesión del juego. Recarga la página."
          );
          setAuthReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Bingo and WordCloud write directly to Firestore (which requires Firebase
  // Auth rules). Upgrade transparently only when opening those game types.
  useEffect(() => {
    if (
      !instance ||
      (instance.type !== "bingo" && instance.type !== "wordcloud") ||
      !uid?.startsWith("g_")
    ) {
      return;
    }
    let cancelled = false;
    signInAnonymouslyIfNeeded()
      .then((user) => {
        if (!cancelled && user?.uid) {
          clearStoredGuestSession();
          setUid(user.uid);
        }
      })
      .catch(() => {
        return;
      });
    return () => {
      cancelled = true;
    };
  }, [instance?.type, uid]);

  // Prefetch the active game's lazy chunk while the user enters their alias
  // or while /join is in flight so rendering after join has 0ms chunk stall.
  useEffect(() => {
    if (!instance?.type) return;
    if (instance.type === "poll") void import("./PollOverlay");
    else if (instance.type === "quiz") void import("./QuizOverlay");
    else if (instance.type === "roulette") void import("./RouletteView");
  }, [instance?.type]);

  const join = useCallback(
    async (name: string) => {
      if (joiningRef.current) return { success: false };
      joiningRef.current = true;
      setJoining(true);
      setJoinError(null);
      try {
        const result = await api.joinEventMinigames(slug, {
          alias: name,
          ...(gameId ? { instanceId: gameId } : {}),
        });
        if (!result.success || !result.data) {
          return { success: false, error: result.error };
        }
        const refreshedGuest = getStoredGuestSession();
        if (refreshedGuest) {
          setUid((prev) =>
            prev === refreshedGuest.uid ? prev : refreshedGuest.uid
          );
        }
        const canonical = result.data.alias;
        setAlias(canonical);
        const joinedEntry = gameId
          ? result.data.instances.find((item) => item.id === gameId)
          : undefined;
        if (gameId && joinedEntry) {
          setJoinedId(gameId);
          setJustJoinedId(joinedEntry.joined ? gameId : null);
        }
        setShowJoin(false);
        try {
          localStorage.setItem(LOCAL_STORAGE_ALIAS_KEY(slug), canonical);
        } catch {
          return { success: true };
        }
        return { success: true };
      } finally {
        joiningRef.current = false;
        setJoining(false);
      }
    },
    [slug, gameId]
  );

  // Auto-join only when the selected instance is live (never force-join closed games).
  useEffect(() => {
    if (
      !instance ||
      isClosed ||
      !uid ||
      joinedId === gameId ||
      joiningRef.current
    ) {
      return;
    }
    if (!alias) {
      setShowJoin(true);
      return;
    }
    let cancelled = false;
    join(alias).then((result) => {
      if (!cancelled && !result.success && result.error) {
        setShowJoin(true);
        setJoinError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [instance?.id, isClosed, uid, joinedId, gameId, alias, join]);

  const canRenderGame = Boolean(
    gameId && instance && (isClosed || (uid && joinedId === gameId))
  );

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [gameId]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-(--line) bg-(--night)/96 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          {gameId ? (
            <button
              type="button"
              onClick={() => navigateToGame(null)}
              className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-(--radius-sm) pr-2 text-sm font-medium text-(--ink) transition-colors hover:text-(--ochre)"
            >
              <ArrowLeftIcon size={18} className="text-(--ochre)" />
              <span>Dinámicas</span>
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src="/gdg-logo.png"
                width={26}
                height={26}
                alt=""
                className="h-6.5 w-6.5 shrink-0"
              />
              <h1 className="m-0 truncate font-(family-name:--font-display) text-lg leading-none font-bold tracking-tight text-(--ink) sm:text-xl">
                {eventName}
              </h1>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2.5">
            {gameId && alias && (
              <span className="inline-flex max-w-[10.5rem] items-center gap-1.5 rounded-full border border-(--line-strong) bg-(--surface-1) px-3 py-1 font-mono text-xs text-(--ink)">
                <span
                  className="bg-google-green h-1.5 w-1.5 shrink-0 rounded-full"
                  aria-hidden="true"
                />
                <span className="truncate">{alias}</span>
              </span>
            )}
            {!gameId && (
              <a
                href={`/events/${slug}`}
                className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 text-sm font-medium text-(--muted) no-underline transition-colors hover:text-(--ink)"
              >
                <ArrowLeftIcon size={15} className="text-(--ochre)" />
                <span>Evento</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-3xl flex-1 px-3.5 pb-[max(2.5rem,calc(1.5rem+env(safe-area-inset-bottom)))] sm:px-6 sm:pt-7 ${
          gameId ? "pt-3.5" : "pt-5"
        }`}
      >
        {/* Game Lobby */}
        {!gameId && (
          <section aria-labelledby="games-heading">
            <p className="n-mono m-0 text-xs font-semibold tracking-[0.18em] text-(--ochre) uppercase">
              GDG ICA · Juegos en vivo
            </p>
            <h2
              id="games-heading"
              className="mt-1.5 mb-0 font-(family-name:--font-display) text-3xl leading-tight font-bold tracking-tight text-(--ink) sm:text-4xl"
            >
              Elige una dinámica
            </h2>
            <p className="mt-2 mb-6 max-w-[38ch] text-[0.9375rem] text-(--muted) sm:text-base">
              Participa desde tu teléfono mientras seguimos el juego en
              pantalla.
            </p>

            {loading && (
              <div
                className="flex items-center gap-3 rounded-2xl border border-(--line) bg-(--surface-1) px-5 py-5 text-(--muted)"
                role="status"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Buscando dinámicas en vivo…
              </div>
            )}

            {liveInstances.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-(--line-strong) bg-(--surface-1)/50 px-6 py-12 text-center">
                <p className="text-lg font-medium text-(--ink)">
                  Aún no hay dinámicas activas
                </p>
                <p className="mt-2 text-sm text-(--muted)">
                  Esta pantalla se actualizará automáticamente cuando comiencen.
                </p>
              </div>
            )}

            {liveInstances.length > 0 && (
              <div className="grid gap-3">
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
                    className="group relative grid min-h-20 touch-manipulation grid-cols-[auto_minmax(0,1fr)_2.25rem] items-center gap-3 overflow-hidden rounded-2xl border border-(--line-strong) bg-(--surface-1) px-3.5 py-3.5 text-(--ink) no-underline transition-[background-color,border-color,transform] duration-150 select-none hover:border-(--ochre)/60 hover:bg-(--surface-2) active:scale-[0.99] motion-reduce:transition-none sm:min-h-22 sm:grid-cols-[auto_minmax(0,1fr)_2.75rem] sm:gap-4 sm:px-4 sm:py-4"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ backgroundColor: TYPE_DOTS[item.type] }}
                    />
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--line) bg-(--surface-2) sm:h-12 sm:w-12"
                      style={{ color: TYPE_DOTS[item.type] }}
                    >
                      <GameTypeIcon type={item.type} size={20} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-(--muted) uppercase">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: TYPE_DOTS[item.type] }}
                          aria-hidden="true"
                        />
                        {TYPE_LABELS[item.type]}
                      </span>
                      <span className="text-base leading-snug font-semibold break-words text-(--ink) sm:text-xl">
                        {item.title}
                      </span>
                    </span>
                    <span
                      className="grid h-9 w-9 place-items-center rounded-full border border-(--line-strong) text-(--ochre) transition-[transform,border-color] duration-150 group-hover:translate-x-0.5 group-hover:border-(--ochre) motion-reduce:transition-none sm:h-11 sm:w-11"
                      aria-hidden="true"
                    >
                      <ArrowRightIcon size={17} />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Loading selected game */}
        {gameId && (loading || !authReady) && (
          <p
            className="flex items-center justify-center gap-3 py-20 text-center text-(--muted)"
            role="status"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
              aria-hidden="true"
            />
            Preparando el juego…
          </p>
        )}

        {/* Scheduled / Not found */}
        {gameId && !loading && !instance && (
          <section className="rounded-2xl border border-dashed border-(--line-strong) bg-(--surface-1)/50 px-6 py-14 text-center">
            <h2 className="m-0 font-(family-name:--font-display) text-2xl font-bold text-(--ink) sm:text-3xl">
              Esperando el juego
            </h2>
            <p className="mt-2.5 text-(--muted)">
              Esta dinámica aún no ha comenzado. Quédate aquí o vuelve al
              listado.
            </p>
            <button
              type="button"
              onClick={() => navigateToGame(null)}
              className="nb nb--ghost mt-6"
            >
              <span className="nb__label">Ver dinámicas en vivo</span>
            </button>
          </section>
        )}

        {/* Live but not joined yet */}
        {gameId && instance && !isClosed && uid && joinedId !== gameId && (
          <section className="n-panel px-6 py-10 text-center sm:py-14">
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-(--line-strong) bg-(--surface-2)"
              style={{ color: TYPE_DOTS[instance.type] }}
            >
              <GameTypeIcon type={instance.type} size={26} />
            </span>
            <h2 className="mt-4 mb-0 font-(family-name:--font-display) text-2xl font-bold text-balance text-(--ink) sm:text-3xl">
              {instance.title}
            </h2>
            {joining ? (
              <p
                className="mt-5 inline-flex items-center justify-center gap-3 text-(--muted)"
                role="status"
              >
                <span
                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Conectando al juego…
              </p>
            ) : (
              <>
                <p className="mt-2.5 text-(--muted)">Únete para participar.</p>
                <button
                  type="button"
                  onClick={() => setShowJoin(true)}
                  className="nb nb--primary mt-6 min-w-48"
                >
                  <span className="nb__label">Entrar</span>
                  <span className="nb__icon nb__icon--arrow" aria-hidden="true">
                    <ArrowRightIcon size={18} />
                  </span>
                </button>
              </>
            )}
          </section>
        )}

        {canRenderGame && instance && (
          <section
            aria-label={isClosed ? "Resultados finales" : "Dinámica en vivo"}
            className="rounded-2xl border border-(--line-strong) bg-(--surface-1) p-3.5 sm:p-6"
          >
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-(--line) pb-2.5 text-sm text-(--muted) sm:mb-5 sm:pb-3.5">
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-wider uppercase">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TYPE_DOTS[instance.type] }}
                  aria-hidden="true"
                />
                {TYPE_LABELS[instance.type]}
                {isClosed && (
                  <span className="rounded-full border border-(--ochre)/40 bg-(--ochre)/12 px-2 py-0.5 text-[11px] text-(--ochre)">
                    Finalizado
                  </span>
                )}
              </span>
              {alias && (
                <span className="hidden text-xs sm:inline sm:text-sm">
                  Jugando como{" "}
                  <strong className="font-semibold text-(--ink)">
                    {alias}
                  </strong>
                </span>
              )}
            </div>

            <Suspense
              fallback={
                <p
                  className="flex items-center justify-center gap-3 py-12 text-center text-(--muted)"
                  role="status"
                >
                  <span
                    className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Cargando dinámica…
                </p>
              }
            >
              {instance.type === "poll" && instance.config && (
                <PollOverlay
                  key={instance.id}
                  slug={slug}
                  instanceId={instance.id}
                  uid={uid ?? ""}
                  alias={alias ?? ""}
                  title={instance.title}
                  config={instance.config as unknown as PollConfig}
                  currentQuestionIndex={
                    instance.currentQuestionIndex ??
                    (instance.config.question ? 0 : -1)
                  }
                  justJoined={justJoinedId === instance.id}
                  closed={isClosed}
                />
              )}
              {instance.type === "quiz" && instance.config && (
                <QuizOverlay
                  key={instance.id}
                  slug={slug}
                  instanceId={instance.id}
                  uid={uid ?? ""}
                  alias={alias ?? ""}
                  title={instance.title}
                  config={instance.config as unknown as QuizConfig}
                  currentQuestionIndex={instance.currentQuestionIndex ?? -1}
                  currentQuestionStartedAt={instance.currentQuestionStartedAt}
                  justJoined={justJoinedId === instance.id}
                  closed={isClosed}
                />
              )}
              {instance.type === "roulette" && (
                <RouletteView
                  key={instance.id}
                  slug={slug}
                  instanceId={instance.id}
                  uid={uid ?? ""}
                  title={instance.title}
                  instance={instance}
                />
              )}
              {instance.type === "bingo" && (
                <BingoCardView
                  key={instance.id}
                  slug={slug}
                  instanceId={instance.id}
                  uid={uid ?? ""}
                  title={instance.title}
                  instance={instance}
                />
              )}
              {instance.type === "wordcloud" && (
                <WordCloudView
                  key={instance.id}
                  slug={slug}
                  instanceId={instance.id}
                  uid={uid ?? ""}
                  title={instance.title}
                  prompt={
                    (instance.config?.prompt as string | undefined) ??
                    "Comparte tu palabra"
                  }
                  maxWordsPerUser={
                    (instance.config?.maxWordsPerUser as number | undefined) ??
                    3
                  }
                  closed={isClosed}
                />
              )}
            </Suspense>

            {isClosed && (
              <div className="mt-6 flex justify-center border-t border-(--line) pt-5">
                <button
                  type="button"
                  onClick={() => navigateToGame(null)}
                  className="nb nb--ghost"
                >
                  <span className="nb__label">Ver otras dinámicas</span>
                </button>
              </div>
            )}
          </section>
        )}

        {(error || joinError || authError) && (
          <p
            role="alert"
            className="mt-5 rounded-r-lg border-l-2 border-red-400 bg-(--surface-1) px-4 py-3 text-sm text-red-200"
          >
            {error || joinError || authError}
          </p>
        )}

        {showJoin && instance && !isClosed && (
          <JoinModal
            liveInstances={[instance]}
            defaultAlias={alias ?? ""}
            onSubmit={join}
            onDismiss={() => setShowJoin(false)}
          />
        )}
      </main>
    </div>
  );
}
