import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import {
  DEFAULT_MURAL_SETTINGS,
  readMuralSettings,
  type MuralSettings,
} from "@/lib/mural";

export function useMuralSettings(slug: string): {
  settings: MuralSettings;
  loading: boolean;
} {
  const [settings, setSettings] = useState<MuralSettings>(
    DEFAULT_MURAL_SETTINGS
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (cancelled) return;

        unsub = onSnapshot(
          doc(db, `events/${slug}/muralMeta/settings`),
          (snap) => {
            setSettings(readMuralSettings(snap.data()));
            setLoading(false);
          },
          () => {
            setSettings(DEFAULT_MURAL_SETTINGS);
            setLoading(false);
          }
        );
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_MURAL_SETTINGS);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [slug]);

  return { settings, loading };
}
