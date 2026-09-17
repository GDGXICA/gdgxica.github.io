import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { MuralPhoto } from "@/lib/mural";

export function useMyMuralPhotos(
  slug: string,
  uid: string | null
): { mine: MuralPhoto[]; loading: boolean } {
  const [mine, setMine] = useState<MuralPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setMine([]);
      setLoading(false);
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, limit, onSnapshot, orderBy, query, where } =
          await import("firebase/firestore");
        if (cancelled) return;

        unsub = onSnapshot(
          query(
            collection(db, `events/${slug}/muralPhotos`),
            where("uid", "==", uid),
            orderBy("createdAt", "desc"),

            limit(60)
          ),
          (snap) => {
            setMine(
              snap.docs.map(
                (d) => ({ id: d.id, ...d.data() }) as unknown as MuralPhoto
              )
            );
            setLoading(false);
          },
          () => setLoading(false)
        );
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug, uid]);

  return { mine, loading };
}
