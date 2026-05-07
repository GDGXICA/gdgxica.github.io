import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";

export interface ParticipantDoc {
  uid: string;
  alias: string;
  bingoCard?: string[];
  bingoMarked?: boolean[];
  bingoWonAt?: { seconds: number } | null;
}

interface State {
  doc: ParticipantDoc | null;
  loading: boolean;
  error: string | null;
}

// Subscribes to events/{slug}/minigames/{instanceId}/participants/{uid}
// in real time. Returns null doc until the first snapshot arrives or if
// the participant has not joined yet (the rules allow public reads, so
// this works for everyone — the spectator badge in MiniGamesRoot also
// consumes it).
export function useParticipantDoc(
  slug: string | null,
  instanceId: string | null,
  uid: string | null
): State {
  const [state, setState] = useState<State>({
    doc: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug || !instanceId || !uid) {
      setState({ doc: null, loading: false, error: null });
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
          `events/${slug}/minigames/${instanceId}/participants/${uid}`
        );
        unsub = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) {
              setState({ doc: null, loading: false, error: null });
              return;
            }
            setState({
              doc: { uid, ...(snap.data() as Omit<ParticipantDoc, "uid">) },
              loading: false,
              error: null,
            });
          },
          (err) => {
            setState({ doc: null, loading: false, error: err.message });
          }
        );
      } catch (err) {
        setState({
          doc: null,
          loading: false,
          error: err instanceof Error ? err.message : "Listener error",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug, instanceId, uid]);

  return state;
}
