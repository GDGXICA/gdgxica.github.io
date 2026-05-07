import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";

export interface LeaderboardEntry {
  uid: string;
  alias: string;
  score: number;
}

export interface AggregatesDoc {
  optionCounts?: Record<string, number>;
  totalResponses?: number;
  leaderboard?: LeaderboardEntry[];
  updatedAt?: { seconds: number } | null;
}

interface State {
  aggregates: AggregatesDoc | null;
  loading: boolean;
  error: string | null;
}

// Subscribes to events/{slug}/minigames/{instanceId}/aggregates/current,
// the single doc that the recomputeAggregates trigger maintains. Used by
// the realtime overlays (poll bars, quiz leaderboard) and by the projector
// view. Caps spectator reads to 1 listener per game per phone.
export function useAggregates(
  slug: string | null,
  instanceId: string | null
): State {
  const [state, setState] = useState<State>({
    aggregates: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug || !instanceId) {
      setState({ aggregates: null, loading: false, error: null });
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (cancelled) return;
        const ref = doc(
          db,
          `events/${slug}/minigames/${instanceId}/aggregates/current`
        );
        unsub = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) {
              setState({ aggregates: null, loading: false, error: null });
              return;
            }
            setState({
              aggregates: snap.data() as AggregatesDoc,
              loading: false,
              error: null,
            });
          },
          (err) => {
            setState({
              aggregates: null,
              loading: false,
              error: err.message,
            });
          }
        );
      } catch (err) {
        setState({
          aggregates: null,
          loading: false,
          error: err instanceof Error ? err.message : "Listener error",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug, instanceId]);

  return state;
}
