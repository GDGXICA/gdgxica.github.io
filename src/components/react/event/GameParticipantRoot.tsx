import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { BingoCardView } from "./BingoCardView";
import { JoinModal } from "./JoinModal";
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
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid grid-cols-2 gap-1" aria-hidden="true">
            <span className="bg-google-blue h-2.5 w-2.5 rounded-full" />
            <span className="bg-google-red h-2.5 w-2.5 rounded-full" />
            <span className="bg-google-yellow h-2.5 w-2.5 rounded-full" />
            <span className="bg-google-green h-2.5 w-2.5 rounded-full" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              GDG ICA · Juegos en vivo
            </p>
            <h1 className="truncate text-lg font-bold">{eventName}</h1>
          </div>
        </div>
        <a
          href={`/events/${slug}`}
          className="hover:text-google-blue focus-visible:outline-google-blue rounded-lg px-2 py-2 text-sm font-medium text-gray-700 underline decoration-gray-400 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-gray-200"
        >
          Volver al evento
        </a>
      </header>
      {!gameId && (
        <section aria-labelledby="games-heading">
          <h2
            id="games-heading"
            className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Elige una dinámica
          </h2>
          <p className="mb-7 text-gray-600 dark:text-gray-300">
            Participa desde tu teléfono mientras seguimos el juego en pantalla.
          </p>
          {loading && (
            <p
              className="rounded-xl bg-white p-6 text-gray-700 dark:bg-gray-900 dark:text-gray-200"
              role="status"
            >
              Buscando dinámicas en vivo…
            </p>
          )}
          {liveInstances.length === 0 && !loading && (
            <p className="rounded-xl bg-white p-6 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
              Todavía no hay dinámicas en vivo. Esta página se actualizará
              cuando comiencen.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {liveInstances.map((item) => (
              <a
                key={item.id}
                href={`?game=${encodeURIComponent(item.id)}`}
                className="group focus-visible:outline-google-blue flex min-h-32 flex-col justify-between rounded-2xl bg-white p-5 shadow-[0_8px_30px_-20px_rgba(17,24,39,.35)] transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-6 dark:bg-gray-900"
              >
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {TYPE_LABELS[item.type]}
                </span>
                <span className="mt-3 flex items-end justify-between gap-3 text-xl font-bold">
                  <span className="min-w-0 break-words">{item.title}</span>
                  <span
                    className="text-google-blue shrink-0 text-2xl transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {gameId && (loading || !authReady) && (
        <p
          className="py-20 text-center text-gray-600 dark:text-gray-300"
          role="status"
        >
          Preparando el juego…
        </p>
      )}
      {gameId && !loading && !instance && (
        <section className="py-20 text-center">
          <h2 className="text-3xl font-bold">Esperando el juego</h2>
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            Esta dinámica aún no está en vivo o ya terminó.
          </p>
          <a
            href={`/events/${slug}/jugar`}
            className="text-google-blue mt-6 inline-block font-semibold underline underline-offset-4"
          >
            Ver dinámicas en vivo
          </a>
        </section>
      )}
      {gameId && instance && uid && joinedId !== gameId && (
        <section className="py-20 text-center">
          <h2 className="text-2xl font-bold">{instance.title}</h2>
          <p className="mt-3">Únete para participar.</p>
          <button
            type="button"
            onClick={() => setShowJoin(true)}
            className="bg-google-blue focus-visible:outline-google-blue mt-5 min-h-12 rounded-xl px-6 py-3 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Entrar
          </button>
        </section>
      )}
      {gameId && instance && uid && joinedId === gameId && (
        <section
          aria-label="Dinámica en vivo"
          className="rounded-2xl bg-white p-5 shadow-[0_20px_50px_-30px_rgba(17,24,39,.45)] sm:p-8 dark:bg-gray-900"
        >
          <div className="mb-6 border-b border-gray-100 pb-4 text-right text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
            Jugando como <strong>{alias}</strong>
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
        <p role="alert" className="mt-5 text-red-600">
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
