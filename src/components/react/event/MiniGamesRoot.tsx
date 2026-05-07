import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { BingoCardView } from "./BingoCardView";
import { JoinModal } from "./JoinModal";
import { useLiveMinigames } from "./useLiveMinigames";
import { WordCloudView } from "./WordCloudView";
import { LOCAL_STORAGE_ALIAS_KEY, type LiveInstance } from "./types";

interface Props {
  slug: string;
  eventStatus?: string;
}

type Step = "init" | "no_live" | "modal" | "joining" | "joined" | "dismissed";

function readStoredAlias(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_ALIAS_KEY(slug));
  } catch {
    return null;
  }
}

function writeStoredAlias(slug: string, alias: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_ALIAS_KEY(slug), alias);
  } catch {
    /* ignore quota / privacy */
  }
}

function readForcePlay(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("play") === "1";
}

export function MiniGamesRoot({ slug }: Props) {
  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("init");
  const [alias, setAlias] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readStoredAlias(slug)
  );
  const [forcePlay] = useState<boolean>(() => readForcePlay());

  const { loading, liveInstances } = useLiveMinigames(authReady ? slug : null);

  // Sign in anonymously (or reuse current user) on mount. We capture the
  // resulting uid so the gameplay components (bingo card, word cloud)
  // can subscribe to the correct participant doc.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await signInAnonymouslyIfNeeded();
        if (!cancelled) {
          setUid(user?.uid ?? null);
          setAuthReady(true);
        }
      } catch {
        if (!cancelled) setAuthReady(true); // proceed; /join will fail loudly
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitJoin = useCallback(
    async (
      pendingAlias: string
    ): Promise<{ success: boolean; error?: string }> => {
      const res = await api.joinEventMinigames(slug, { alias: pendingAlias });
      if (res.success && res.data) {
        const stored = res.data.alias;
        writeStoredAlias(slug, stored);
        setAlias(stored);
        setStep("joined");
        return { success: true };
      }
      return { success: false, error: res.error };
    },
    [slug]
  );

  // Drive the state machine off (live instances, alias, dismissed).
  useEffect(() => {
    if (!authReady || loading) return;

    if (liveInstances.length === 0) {
      // No live games; reset to neutral state. Keep alias in localStorage.
      if (step !== "joined") setStep("no_live");
      return;
    }

    if (step === "joined" && !forcePlay) return;
    if (step === "dismissed" && !forcePlay) return;

    if (alias && !forcePlay) {
      // Auto-rejoin silently for returning visitors.
      setStep("joining");
      submitJoin(alias).then((res) => {
        if (!res.success) {
          // Surface the modal so the user can pick a new alias.
          setStep("modal");
        }
      });
      return;
    }

    setStep("modal");
  }, [
    authReady,
    loading,
    liveInstances.length,
    alias,
    forcePlay,
    step,
    submitJoin,
  ]);

  const indicatorAlias = useMemo(
    () => (step === "joined" ? alias : null),
    [step, alias]
  );

  // Global games (wordcloud + bingo) play inline once the participant is
  // joined. PR6 will add overlays for the realtime modes (poll + quiz),
  // which are intentionally ignored here.
  const globalLive = useMemo(
    () =>
      (liveInstances as LiveInstance[]).filter(
        (inst) => inst.mode === "global"
      ),
    [liveInstances]
  );

  if (!authReady || loading || step === "init") return null;
  if (step === "no_live") return null;

  return (
    <>
      {step === "modal" && (
        <JoinModal
          liveInstances={liveInstances as LiveInstance[]}
          defaultAlias={alias ?? ""}
          onSubmit={submitJoin}
          onDismiss={() => setStep("dismissed")}
        />
      )}

      {indicatorAlias && (
        <div className="container my-4 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 shadow-sm dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            <span aria-hidden>🎉</span>
            <span>
              Conectado como <strong>{indicatorAlias}</strong> ·{" "}
              {liveInstances.length} juego{liveInstances.length !== 1 && "s"} en
              vivo
            </span>
          </div>
        </div>
      )}

      {step === "joined" && uid && globalLive.length > 0 && (
        <section className="container my-8" aria-label="Participación en vivo">
          <h2 className="text-primary mb-4 text-2xl font-semibold">
            Participación en vivo
          </h2>
          <div className="space-y-6">
            {globalLive.map((inst) => (
              <div
                key={inst.id}
                className="border-gray-custom rounded-lg border p-6 shadow-sm"
              >
                {inst.type === "wordcloud" && (
                  <WordCloudView
                    slug={slug}
                    instanceId={inst.id}
                    uid={uid}
                    title={inst.title}
                    prompt={
                      (inst.config?.prompt as string | undefined) ??
                      "Comparte tu palabra"
                    }
                    maxWordsPerUser={
                      (inst.config?.maxWordsPerUser as number | undefined) ?? 3
                    }
                  />
                )}
                {inst.type === "bingo" && (
                  <BingoCardView
                    slug={slug}
                    instanceId={inst.id}
                    uid={uid}
                    title={inst.title}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// Default export so Astro's React integration can hydrate the island
// from a single import path without a named-export hop.
export default MiniGamesRoot;
