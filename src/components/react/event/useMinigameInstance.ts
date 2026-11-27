import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { LiveInstance } from "./types";

interface State {
  loading: boolean;
  instance: LiveInstance | null;
  error: string | null;
}

export function useMinigameInstance(
  slug: string | null,
  gameId: string | null
): State {
  const [state, setState] = useState<State>({
    loading: Boolean(slug && gameId),
    instance: null,
    error: null,
  });

  useEffect(() => {
    if (!slug || !gameId) {
      setState({ loading: false, instance: null, error: null });
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const db = await getFirestore();
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (cancelled) return;
        const ref = doc(db, `events/${slug}/minigames/${gameId}`);
        unsub = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) {
              setState({ loading: false, instance: null, error: null });
              return;
            }
            const data = { id: snap.id, ...snap.data() } as LiveInstance;
            setState({
              loading: false,
              instance: data.state === "live" ? data : null,
              error: null,
            });
          },
          (err) => {
            setState({ loading: false, instance: null, error: err.message });
          }
        );
      } catch (err) {
        setState({
          loading: false,
          instance: null,
          error: err instanceof Error ? err.message : "Listener error",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug, gameId]);

  return state;
}
