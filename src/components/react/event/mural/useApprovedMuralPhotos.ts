import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { MuralPhoto } from "@/lib/mural";

export const APPROVED_LIMIT = 120;

export function useApprovedMuralPhotos(slug: string): {
  photos: MuralPhoto[];
  loading: boolean;
  error: string | null;
} {
  const [photos, setPhotos] = useState<MuralPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
            where("status", "==", "approved"),
            orderBy("approvedAt", "desc"),
            limit(APPROVED_LIMIT)
          ),
          (snap) => {
            setPhotos(
              snap.docs.map(
                (d) => ({ id: d.id, ...d.data() }) as unknown as MuralPhoto
              )
            );
            setLoading(false);
            setError(null);
          },
          (err) => {
            setError(err.message);
            setLoading(false);
          }
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error de conexión");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug]);

  return { photos, loading, error };
}
