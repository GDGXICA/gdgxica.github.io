import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { Attendee, CheckinMeta } from "./types";

interface State {
  attendees: Attendee[];
  meta: CheckinMeta | null;
  loading: boolean;
  error: string | null;
  /** Snapshot served from the local cache — i.e. we are offline. */
  fromCache: boolean;
  /** Rows whose write has not reached the server yet. */
  pendingCount: number;
}

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date };
  return typeof ts.toDate === "function" ? ts.toDate() : null;
};

/**
 * Subscribes to events/{slug}/roster in real time so several volunteers
 * working the door see the same state.
 *
 * Follows the same lazy-import + `cancelled` flag shape as the public
 * event islands (see ../../event/useLiveMinigames.ts), with one addition:
 * `includeMetadataChanges`, which the game hooks do not need.
 */
export function useRoster(slug: string | null): State {
  const [state, setState] = useState<State>({
    attendees: [],
    meta: null,
    loading: true,
    error: null,
    fromCache: false,
    pendingCount: 0,
  });

  useEffect(() => {
    if (!slug) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let unsubRoster: (() => void) | null = null;
    let unsubMeta: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const db = await getFirestore();
        const { collection, doc, onSnapshot } = await import(
          "firebase/firestore"
        );
        if (cancelled) return;

        unsubRoster = onSnapshot(
          collection(db, `events/${slug}/roster`),
          // Without this the pending -> committed transition fires no
          // callback, so the "sin conexión" badge would stick forever
          // after the writes have actually landed.
          { includeMetadataChanges: true },
          (snap) => {
            const attendees = snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                ticketNumber: data.ticketNumber ?? "",
                orderNumber: data.orderNumber ?? "",
                firstName: data.firstName ?? "",
                lastName: data.lastName ?? "",
                email: data.email ?? "",
                company: data.company ?? "",
                title: data.title ?? "",
                ticketTitle: data.ticketTitle ?? "",
                searchTokens: data.searchTokens ?? [],
                bevyCheckinAt: toDate(data.bevyCheckinAt),
                lastImportId: data.lastImportId ?? "",
                checkedIn: data.checkedIn === true,
                checkedInAt: toDate(data.checkedInAt),
                checkedInBy: data.checkedInBy ?? null,
                checkedInByName: data.checkedInByName ?? null,
                note: data.note ?? null,
                dniVerified: data.dniVerified === true,
                pending: d.metadata.hasPendingWrites,
              } satisfies Attendee;
            });

            attendees.sort((a, b) =>
              `${a.firstName} ${a.lastName}`.localeCompare(
                `${b.firstName} ${b.lastName}`,
                "es"
              )
            );

            setState((s) => ({
              ...s,
              attendees,
              loading: false,
              error: null,
              fromCache: snap.metadata.fromCache,
              pendingCount: attendees.filter((a) => a.pending).length,
            }));
          },
          (err) => {
            setState((s) => ({ ...s, loading: false, error: err.message }));
          }
        );

        unsubMeta = onSnapshot(
          doc(db, `events/${slug}/checkinMeta/current`),
          (snap) => {
            const data = snap.data();
            setState((s) => ({
              ...s,
              meta: data
                ? {
                    lastImportId: data.lastImportId ?? null,
                    lastImportAt: toDate(data.lastImportAt),
                    lastImportByName: data.lastImportByName ?? null,
                    rosterCount: data.rosterCount ?? 0,
                  }
                : null,
            }));
          },
          // A missing meta doc is normal before the first import, so a
          // failure here must not blank out a working roster.
          () => {}
        );
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Listener error",
        }));
      }
    })();

    return () => {
      cancelled = true;
      if (unsubRoster) unsubRoster();
      if (unsubMeta) unsubMeta();
    };
  }, [slug]);

  return state;
}

/**
 * Toggles a check-in.
 *
 * Deliberately NOT awaited by callers: while offline, updateDoc's promise
 * does not settle until the connection returns. The local cache fires a
 * snapshot immediately, so the row flips instantly either way; `onError`
 * exists for the rules-rejection path, which surfaces only on reconnect
 * and would otherwise silently revert a row minutes later.
 */
export async function setCheckedIn(
  slug: string,
  attendeeId: string,
  checkedIn: boolean,
  by: { uid: string; name: string },
  onError: (message: string) => void
): Promise<void> {
  try {
    const db = await getFirestore();
    const { doc, updateDoc, serverTimestamp } = await import(
      "firebase/firestore"
    );
    void updateDoc(doc(db, `events/${slug}/roster/${attendeeId}`), {
      checkedIn,
      checkedInAt: checkedIn ? serverTimestamp() : null,
      // The rules require attribution when marking present.
      checkedInBy: checkedIn ? by.uid : null,
      checkedInByName: checkedIn ? by.name : null,
    }).catch((err) => {
      onError(err instanceof Error ? err.message : "No se pudo guardar");
    });
  } catch (err) {
    onError(err instanceof Error ? err.message : "No se pudo guardar");
  }
}
