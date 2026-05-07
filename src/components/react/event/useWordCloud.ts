import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";

export interface CloudWord {
  id: string;
  text: string;
  normalized: string;
  count: number;
  hidden?: boolean;
}

interface State {
  words: CloudWord[];
  loading: boolean;
  error: string | null;
}

// Subscribes to the words subcollection of a wordcloud instance,
// ordered by count desc. Hidden words are filtered client-side because
// Firestore != queries on booleans require composite indexes that we
// don't otherwise need.
export function useWordCloud(
  slug: string | null,
  instanceId: string | null,
  limitCount = 50
): State {
  const [state, setState] = useState<State>({
    words: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug || !instanceId) {
      setState({ words: [], loading: false, error: null });
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, query, orderBy, limit, onSnapshot } = await import(
          "firebase/firestore"
        );
        if (cancelled) return;
        const q = query(
          collection(db, `events/${slug}/minigames/${instanceId}/words`),
          orderBy("count", "desc"),
          limit(limitCount)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            const all = snap.docs.map(
              (d) => ({ id: d.id, ...d.data() }) as CloudWord
            );
            setState({
              words: all.filter((w) => !w.hidden),
              loading: false,
              error: null,
            });
          },
          (err) => {
            setState({ words: [], loading: false, error: err.message });
          }
        );
      } catch (err) {
        setState({
          words: [],
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
