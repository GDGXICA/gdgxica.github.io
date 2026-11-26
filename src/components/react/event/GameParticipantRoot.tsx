import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { BingoCardView } from "./BingoCardView";
import { JoinModal, TYPE_DOTS } from "./JoinModal";
import { PollOverlay } from "./PollOverlay";
import { QuizOverlay } from "./QuizOverlay";
import { RouletteView } from "./RouletteView";
import { WordCloudView } from "./WordCloudView";
import { LOCAL_STORAGE_ALIAS_KEY } from "./types";
import { useLiveMinigames } from "./useLiveMinigames";
import { useGameId } from "./useGameId";
import type { PollConfig, QuizConfig } from "../admin/minigame-templates/types";
import { TYPE_LABELS } from "../admin/minigame-templates/types";

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
  const [showJoin, setShowJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const { liveInstances, loading, error } = useLiveMinigames(
    authReady ? slug : null
  );
  const instance = liveInstances.find((item) => item.id === gameId);

  useEffect(() => {
    let cancelled = false;
    signInAnonymouslyIfNeeded()
      .then((user) => {
        if (!cancelled) {
          setUid(user?.uid ?? null);
          if (!user)
            setAuthError(
              "No pudimos iniciar la sesión del juego. Recarga la página."
            );
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthError(
            "No pudimos iniciar la sesión del juego. Recarga la página."
          );
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const join = useCallback(
    async (name: string) => {
      const result = await api.joinEventMinigames(slug, { alias: name });
      if (!result.success || !result.data)
        return { success: false, error: result.error };
      const canonical = result.data.alias;
      setAlias(canonical);
      if (gameId && result.data.instances.some((item) => item.id === gameId))
        setJoinedId(gameId);
      setShowJoin(false);
      try {
        localStorage.setItem(LOCAL_STORAGE_ALIAS_KEY(slug), canonical);
      } catch {
        return { success: true };
      }
      return { success: true };
    },
    [slug, gameId]
  );

  useEffect(() => {
    if (!instance || !uid || joinedId === gameId) return;
    if (!alias) {
      setShowJoin(true);
      return;
    }
    let cancelled = false;
    join(alias).then((result) => {
      if (!cancelled && !result.success) {
        setShowJoin(true);
        setJoinError(result.error ?? "No pudimos conectarte");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [instance?.id, uid, joinedId, gameId, alias, join]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 pt-3 pb-16 sm:px-6 sm:pt-5">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-(--line) pb-4 sm:mb-14">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/gdg-logo.png"
            width={32}
            height={32}
            alt=""
            className="h-8 w-8 shrink-0"
          />
          <div className="flex min-w-0 flex-col-reverse">
            <p className="game-dim n-mono">
              <span>GDG ICA · Juegos en vivo</span>
            </p>
            <h1 className="m-0 truncate font-(family-name:--font-display) text-[1.625rem] leading-none font-bold tracking-[-0.01em] text-(--ink)">
              {eventName}
            </h1>
          </div>
        </div>
        <a
          href={`/events/${slug}`}
          className="n-link inline-flex min-h-11 items-center gap-2 text-[0.9375rem]"
        >
          <ArrowLeftIcon />
          Volver al evento
        </a>
      </header>
      {!gameId && (
        <section aria-labelledby="games-heading">
          <h2 id="games-heading" className="n-head m-0">
            Elige una dinámica
          </h2>
          <p className="n-lead mt-4 mb-10 max-w-[34ch] text-(--muted)">
            Participa desde tu teléfono mientras seguimos el juego en pantalla.
          </p>
          {loading && (
            <p
              className="flex items-center gap-3 rounded-(--radius) border border-(--line) bg-(--surface-1) px-5 py-5 text-(--muted)"
              role="status"
            >
              <span
                className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
                aria-hidden="true"
              />
              Buscando dinámicas en vivo…
            </p>
          )}
          {liveInstances.length === 0 && !loading && (
            <p className="rounded-(--radius) border border-dashed border-(--line-strong) px-6 py-10 text-(--muted)">
              Todavía no hay dinámicas en vivo. Esta página se actualizará
              cuando comiencen.
            </p>
          )}
          {liveInstances.length > 0 && (
            <div className="border-t border-(--line)">
              {liveInstances.map((item) => (
                <a
                  key={item.id}
                  href={`?game=${encodeURIComponent(item.id)}`}
                  className="group grid min-h-24 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-4 border-b border-(--line) px-1 py-4 text-(--ink) no-underline transition-colors hover:bg-(--surface-1) sm:px-4"
                >
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="inline-flex items-center gap-2 text-[0.9375rem] text-(--muted)">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: TYPE_DOTS[item.type] }}
                        aria-hidden="true"
                      />
                      {TYPE_LABELS[item.type]}
                    </span>
                    <span className="text-[1.375rem] leading-tight font-semibold tracking-[-0.015em] break-words">
                      {item.title}
                    </span>
                  </span>
                  <span
                    className="grid h-11 w-11 place-items-center rounded-full border border-(--line-strong) text-(--ochre) transition-[transform,border-color] duration-200 group-hover:translate-x-1 group-hover:border-(--ochre) motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    aria-hidden="true"
                  >
                    <ArrowRightIcon />
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>
      )}
      {gameId && (loading || !authReady) && (
        <p
          className="flex items-center justify-center gap-3 py-20 text-center text-(--muted)"
          role="status"
        >
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
            aria-hidden="true"
          />
          Preparando el juego…
        </p>
      )}
      {gameId && !loading && !instance && (
        <section className="rounded-(--radius) border border-dashed border-(--line-strong) px-6 py-14 text-center sm:py-20">
          <h2 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-(--ink)">
            Esperando el juego
          </h2>
          <p className="mt-3 text-(--muted)">
            Esta dinámica aún no está en vivo o ya terminó.
          </p>
          <a
            href={`/events/${slug}/jugar`}
            className="n-link mt-4 inline-flex min-h-11 items-center"
          >
            Ver dinámicas en vivo
          </a>
        </section>
      )}
      {gameId && instance && uid && joinedId !== gameId && (
        <section className="n-panel px-6 py-12 text-center sm:py-16">
          <h2 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-balance text-(--ink)">
            {instance.title}
          </h2>
          <p className="mt-3 text-(--muted)">Únete para participar.</p>
          <button
            type="button"
            onClick={() => setShowJoin(true)}
            className="nb nb--primary mt-6 min-w-48"
          >
            <span className="nb__label">Entrar</span>
            <span className="nb__icon nb__icon--arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </button>
        </section>
      )}
      {gameId && instance && uid && joinedId === gameId && (
        <section
          aria-label="Dinámica en vivo"
          className="n-panel n-marks p-5 sm:p-8"
        >
          <div className="mb-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-(--line) pb-4 text-[0.9375rem] text-(--muted)">
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: TYPE_DOTS[instance.type] }}
                aria-hidden="true"
              />
              {TYPE_LABELS[instance.type]}
            </span>
            <span>
              Jugando como{" "}
              <strong className="font-semibold text-(--ink)">{alias}</strong>
            </span>
          </div>
          {instance.type === "poll" && instance.config && (
            <PollOverlay
              slug={slug}
              instanceId={instance.id}
              uid={uid}
              alias={alias ?? ""}
              title={instance.title}
              config={instance.config as unknown as PollConfig}
              currentQuestionIndex={
                instance.currentQuestionIndex ??
                (instance.config.question ? 0 : -1)
              }
            />
          )}
          {instance.type === "quiz" && instance.config && (
            <QuizOverlay
              slug={slug}
              instanceId={instance.id}
              uid={uid}
              alias={alias ?? ""}
              title={instance.title}
              config={instance.config as unknown as QuizConfig}
              currentQuestionIndex={instance.currentQuestionIndex ?? -1}
              currentQuestionStartedAt={instance.currentQuestionStartedAt}
            />
          )}
          {instance.type === "roulette" && (
            <RouletteView
              slug={slug}
              instanceId={instance.id}
              uid={uid}
              title={instance.title}
              instance={instance}
            />
          )}
          {instance.type === "bingo" && (
            <BingoCardView
              slug={slug}
              instanceId={instance.id}
              uid={uid}
              title={instance.title}
              instance={instance}
            />
          )}
          {instance.type === "wordcloud" && (
            <WordCloudView
              slug={slug}
              instanceId={instance.id}
              uid={uid}
              title={instance.title}
              prompt={
                (instance.config?.prompt as string | undefined) ??
                "Comparte tu palabra"
              }
              maxWordsPerUser={
                (instance.config?.maxWordsPerUser as number | undefined) ?? 3
              }
            />
          )}
        </section>
      )}
      {(error || joinError || authError) && (
        <p
          role="alert"
          className="mt-6 border-l-2 border-red-400 bg-(--surface-1) px-4 py-3 text-red-200"
        >
          {error || joinError || authError}
        </p>
      )}
      {showJoin && instance && (
        <JoinModal
          liveInstances={[instance]}
          defaultAlias={alias ?? ""}
          onSubmit={join}
          onDismiss={() => setShowJoin(false)}
        />
      )}
    </main>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-(--ochre)"
      aria-hidden="true"
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}
