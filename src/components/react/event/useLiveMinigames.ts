import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { LiveInstance } from "./types";

interface State {
  loading: boolean;
  liveInstances: LiveInstance[];
  error: string | null;
}

// Subscribes to `events/{slug}/minigames where state == "live"`.
// Returns the live snapshot in real time. The hook owns the listener
// lifecycle so PR5/PR6 callers don't have to re-implement the cleanup
// (memory leaks via stale onSnapshot are the most common bug here).
export function useLiveMinigames(slug: string | null): State {
  const [state, setState] = useState<State>({
    loading: true,
    liveInstances: [],
    error: null,
  });

  useEffect(() => {
    if (!slug) {
      setState({ loading: false, liveInstances: [], error: null });
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, query, where, onSnapshot, orderBy } = await import(
          "firebase/firestore"
        );
        if (cancelled) return;
        const q = query(
          collection(db, `events/${slug}/minigames`),
          where("state", "==", "live"),
          orderBy("order", "asc")
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            const liveInstances = snap.docs.map(
              (d) => ({ id: d.id, ...d.data() }) as LiveInstance
            );
            setState({ loading: false, liveInstances, error: null });
          },
          (err) => {
            setState({
              loading: false,
              liveInstances: [],
              error: err.message,
            });
          }
        );
      } catch (err) {
        setState({
          loading: false,
          liveInstances: [],
          error: err instanceof Error ? err.message : "Listener error",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug]);

  return state;
}
