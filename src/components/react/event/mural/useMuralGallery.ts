import { useCallback, useEffect, useRef, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { MuralPhoto } from "@/lib/mural";

export const GALLERY_PAGE = 60;

interface State {
  photos: MuralPhoto[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
}

export function useMuralGallery(slug: string): State {
  const [photos, setPhotos] = useState<MuralPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<unknown>(null);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (first: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!first) setLoadingMore(true);

      try {
        const db = await getFirestore();
        const {
          collection,
          getDocs,
          limit,
          orderBy,
          query,
          startAfter,
          where,
        } = await import("firebase/firestore");

        const constraints = [
          where("status", "==", "approved"),
          orderBy("approvedAt", "desc"),
          limit(GALLERY_PAGE),
        ];
        const after = first ? null : cursor.current;

        const snap = await getDocs(
          after
            ? query(
                collection(db, `events/${slug}/muralPhotos`),
                ...constraints,
                startAfter(after as never)
              )
            : query(
                collection(db, `events/${slug}/muralPhotos`),
                ...constraints
              )
        );

        const page = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as unknown as MuralPhoto
        );
        cursor.current = snap.docs[snap.docs.length - 1] ?? cursor.current;

        setPhotos((prev) => (first ? page : [...prev, ...page]));
        setHasMore(snap.docs.length === GALLERY_PAGE);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de conexión");
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    cursor.current = null;
    setPhotos([]);
    setHasMore(false);
    setLoading(true);
    fetchPage(true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    fetchPage(false);
  }, [hasMore, fetchPage]);

  return { photos, loading, loadingMore, hasMore, error, loadMore };
}
