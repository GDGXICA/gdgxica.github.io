import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";

export interface RouletteParticipant {
  uid: string;
  alias: string;
  joinedAt: { seconds: number; nanoseconds?: number } | null;
  rouletteWonAt: { seconds: number; nanoseconds?: number } | null;
  rouletteSpinNumber: number | null;
}

interface State {
  all: RouletteParticipant[];
  eligible: RouletteParticipant[];
  winners: RouletteParticipant[];
  loading: boolean;
  error: string | null;
}

// Subscribes to all participants in a roulette instance. Derives eligible
// (not yet won) and winners (won, ordered by spin number) client-side so
// both the projector and participant view stay in sync with one listener.
export function useRouletteParticipants(
  slug: string | null,
  instanceId: string | null
): State {
  const [state, setState] = useState<State>({
    all: [],
    eligible: [],
    winners: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug || !instanceId) {
      setState({
        all: [],
        eligible: [],
        winners: [],
        loading: false,
        error: null,
      });
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, onSnapshot } = await import("firebase/firestore");
        if (cancelled) return;

        unsub = onSnapshot(
          collection(db, `events/${slug}/minigames/${instanceId}/participants`),
          (snap) => {
            const all = snap.docs.map((d) => ({
              uid: d.id,
              ...(d.data() as Omit<RouletteParticipant, "uid">),
            })) as RouletteParticipant[];

            const eligible = all.filter(
              (p) => p.rouletteWonAt === null || p.rouletteWonAt === undefined
            );
            const winners = all
              .filter(
                (p) => p.rouletteWonAt !== null && p.rouletteWonAt !== undefined
              )
              .sort(
                (a, b) =>
                  (a.rouletteSpinNumber ?? 0) - (b.rouletteSpinNumber ?? 0)
              );

            setState({ all, eligible, winners, loading: false, error: null });
          },
          (err) => {
            setState({
              all: [],
              eligible: [],
              winners: [],
              loading: false,
              error: err.message,
            });
          }
        );
      } catch (err) {
        setState({
          all: [],
          eligible: [],
          winners: [],
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
