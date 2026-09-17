import { useEffect, useMemo, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import {
  DEFAULT_MURAL_SETTINGS,
  readMuralSettings,
  type MuralPhoto,
  type MuralSettings,
} from "@/lib/mural";

export const MAX_LISTED = 300;

interface State {
  pending: MuralPhoto[];
  approved: MuralPhoto[];
  removalRequested: MuralPhoto[];
  queueFull: boolean;
  settings: MuralSettings;
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  pending: [],
  approved: [],
  removalRequested: [],
  queueFull: false,
  settings: DEFAULT_MURAL_SETTINGS,
  loading: false,
  error: null,
};

function toPhotos(docs: { id: string; data: () => unknown }[]): MuralPhoto[] {
  return docs.map(
    (d) => ({ id: d.id, ...(d.data() as object) }) as unknown as MuralPhoto
  );
}

export function useMuralPhotos(slug: string | null): State {
  const [pending, setPending] = useState<MuralPhoto[]>([]);
  const [approved, setApproved] = useState<MuralPhoto[]>([]);
  const [settings, setSettings] = useState<MuralSettings>(
    DEFAULT_MURAL_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setPending([]);
      setApproved([]);
      setLoading(false);
      return;
    }

    const unsubs: (() => void)[] = [];
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, doc, limit, onSnapshot, orderBy, query, where } =
          await import("firebase/firestore");
        if (cancelled) return;

        const photos = collection(db, `events/${slug}/muralPhotos`);

        unsubs.push(
          onSnapshot(
            query(
              photos,
              where("status", "==", "pending"),
              orderBy("createdAt", "asc"),
              limit(MAX_LISTED)
            ),
            (snap) => {
              setPending(toPhotos(snap.docs));
              setLoading(false);
              setError(null);
            },
            (err) => {
              setError(err.message);
              setLoading(false);
            }
          )
        );

        unsubs.push(
          onSnapshot(
            query(
              photos,
              where("status", "==", "approved"),
              orderBy("approvedAt", "desc"),
              limit(MAX_LISTED)
            ),
            (snap) => setApproved(toPhotos(snap.docs)),
            (err) => setError(err.message)
          )
        );

        unsubs.push(
          onSnapshot(
            doc(db, `events/${slug}/muralMeta/settings`),
            (snap) => setSettings(readMuralSettings(snap.data())),
            () => setSettings(DEFAULT_MURAL_SETTINGS)
          )
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error de conexión");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      for (const unsub of unsubs) unsub();
    };
  }, [slug]);

  return useMemo(() => {
    if (!slug) return EMPTY;
    return {
      pending,
      approved,
      removalRequested: [...pending, ...approved].filter(
        (p) =>
          p.removalRequestedAt !== null && p.removalRequestedAt !== undefined
      ),
      queueFull: pending.length >= MAX_LISTED,
      settings,
      loading,
      error,
    };
  }, [slug, pending, approved, settings, loading, error]);
}
