import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { Credential } from "./types";

interface State {
  credentials: Credential[];
  loading: boolean;
  error: string | null;
}

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date };
  return typeof ts.toDate === "function" ? ts.toDate() : null;
};

/**
 * Subscribes to events/{slug}/credentials in real time.
 *
 * Shaped like ../checkin/useRoster.ts but deliberately WITHOUT
 * `includeMetadataChanges` and without the pending/offline machinery. That
 * complexity exists on the roster because volunteers write check-ins
 * straight to Firestore so they queue offline at a noisy door. Nothing
 * here writes from the client — every credential mutation goes through the
 * API — so tracking un-acknowledged local writes would report on something
 * that cannot happen.
 */
export function useCredentials(slug: string | null): State {
  const [state, setState] = useState<State>({
    credentials: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug) {
      setState({ credentials: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    setState({ credentials: [], loading: true, error: null });

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, onSnapshot, orderBy, query } =
          await import("firebase/firestore");
        if (cancelled) return;

        const q = query(
          collection(db, `events/${slug}/credentials`),
          orderBy("sequenceNumber", "asc")
        );

        unsubscribe = onSnapshot(
          q,
          (snap) => {
            if (cancelled) return;
            const credentials = snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                dni: (data.dni as string) ?? "",
                dniNormalized: (data.dniNormalized as string) ?? "",
                firstName: (data.firstName as string) ?? "",
                lastName: (data.lastName as string) ?? "",
                email: (data.email as string) ?? "",
                company: (data.company as string) ?? "",
                githubUsername: (data.githubUsername as string | null) ?? null,
                heardAbout: (data.heardAbout as string) ?? "",
                heardAboutOther: (data.heardAboutOther as string) ?? "",
                yearsExperience: (data.yearsExperience as string) ?? "",
                googleToolsLevel: (data.googleToolsLevel as string) ?? "",
                sequenceNumber: (data.sequenceNumber as number) ?? 0,
                groupLetter: (data.groupLetter as string) ?? "",
                avatarKind:
                  (data.avatarKind as Credential["avatarKind"]) ?? "mascot",
                mascotId: (data.mascotId as string | null) ?? null,
                photoStatus:
                  (data.photoStatus as Credential["photoStatus"]) ?? "none",
                photoPath: (data.photoPath as string | null) ?? null,
                credentialImagePath:
                  (data.credentialImagePath as string | null) ?? null,
                photoUploadedAt: toDate(data.photoUploadedAt),
                emailStatus:
                  (data.emailStatus as Credential["emailStatus"]) ?? "queued",
                emailAttempts: (data.emailAttempts as number) ?? 0,
                emailLastError: (data.emailLastError as string | null) ?? null,
                emailSentAt: toDate(data.emailSentAt),
                bevyStatus:
                  (data.bevyStatus as Credential["bevyStatus"]) ?? "pending",
                bevyTicketNumber:
                  (data.bevyTicketNumber as string | null) ?? null,
                bevyNote: (data.bevyNote as string | null) ?? null,
                bevyLoadedAt: toDate(data.bevyLoadedAt),
                createdAt: toDate(data.createdAt),
              } satisfies Credential;
            });
            setState({ credentials, loading: false, error: null });
          },
          (err) => {
            if (cancelled) return;
            setState({
              credentials: [],
              loading: false,
              error: `No se pudieron cargar las credenciales: ${err.message}`,
            });
          }
        );
      } catch (err) {
        if (cancelled) return;
        setState({
          credentials: [],
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las credenciales",
        });
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [slug]);

  return state;
}
