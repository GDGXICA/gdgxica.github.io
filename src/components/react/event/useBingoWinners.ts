import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";

export interface BingoWinner {
  uid: string;
  alias: string;
  bingoWonAt: { seconds: number; nanoseconds?: number } | null;
}

interface State {
  winners: BingoWinner[];
  loading: boolean;
  error: string | null;
}

// Subscribes to events/{slug}/minigames/{instanceId}/participants in
// real time and surfaces those who have won bingo (bingoWonAt != null),
// ordered by win timestamp ascending so the projector ticker shows the
// first winner first. Public Firestore reads make this work without
// authentication — the venue laptop just needs network access.
export function useBingoWinners(
  slug: string | null,
  instanceId: string | null,
  limitCount = 20
): State {
  const [state, setState] = useState<State>({
    winners: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug || !instanceId) {
      setState({ winners: [], loading: false, error: null });
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, query, where, orderBy, limit, onSnapshot } =
          await import("firebase/firestore");
        if (cancelled) return;
        // We use `where != null` rather than ">=" or "==" so docs with no
        // bingoWonAt are excluded. Firestore creates the necessary
        // single-field index automatically for this kind of inequality.
        const q = query(
          collection(db, `events/${slug}/minigames/${instanceId}/participants`),
          where("bingoWonAt", "!=", null),
          orderBy("bingoWonAt", "asc"),
          limit(limitCount)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            const winners = snap.docs.map(
              (d) =>
                ({
                  uid: d.id,
                  ...(d.data() as Omit<BingoWinner, "uid">),
                }) as BingoWinner
            );
            setState({ winners, loading: false, error: null });
          },
          (err) => {
            setState({ winners: [], loading: false, error: err.message });
          }
        );
      } catch (err) {
        setState({
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
  }, [slug, instanceId, limitCount]);

  return state;
}
