import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { Attendee, CheckinMeta } from "./types";

interface State {
  attendees: Attendee[];
  meta: CheckinMeta | null;
  loading: boolean;
  error: string | null;
  /**
   * True only when we believe we are actually disconnected.
   *
   * NOT the same as snapshot.metadata.fromCache. With persistence enabled
   * Firestore serves a cached snapshot on every load before the server
   * responds, so fromCache alone flags a perfectly healthy page as offline.
   */
  offline: boolean;
  /** True once a server-backed snapshot has arrived at least once. */
  syncedOnce: boolean;
  /**
   * Import metadata failed to load. Kept separate from `error` because the
   * roster itself is still usable — it only means the "ya no está en el
   * CSV" badges cannot be computed, which is worth saying out loud rather
   * than letting the feature quietly do nothing.
   */
  metaError: string | null;
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
    offline: false,
    syncedOnce: false,
    metaError: null,
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
              // "estimate" resolves a still-pending serverTimestamp() to the
              // local clock instead of null. With the default ("none") a
              // just-marked attendee showed "✓ Presente" with no time and no
              // volunteer name until the server acked — which on venue wifi,
              // the whole reason this feature exists, can be the entire event.
              const data = d.data({ serverTimestamps: "estimate" });
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

            setState((s) => {
              // A server-backed snapshot is the only proof we are online.
              // Before the first one arrives, fromCache just means the cache
              // answered first — treat that as still loading, not offline,
              // or a cold cache renders "this roster is empty" for an event
              // that is fully populated server-side and invites a re-import.
              const syncedOnce = s.syncedOnce || !snap.metadata.fromCache;
              return {
                ...s,
                attendees,
                loading: !syncedOnce && attendees.length === 0,
                error: null,
                syncedOnce,
                offline: snap.metadata.fromCache && syncedOnce,
                pendingCount: attendees.filter((a) => a.pending).length,
              };
            });
          },
          (err) => {
            // Firestore does not re-attach a listener after an error, so
            // this state is terminal until remount. Clear the roster: on a
            // permission error (role revoked mid-event) the cached snapshot
            // would otherwise stay on screen, fully tappable, behind a
            // banner, with every tap rejected and nothing else updating.
            setState((s) => ({
              ...s,
              attendees: [],
              loading: false,
              offline: false,
              pendingCount: 0,
              error: err.message,
            }));
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
          // The previous comment here claimed this guarded a missing meta
          // doc before the first import. That was wrong: a non-existent
          // document goes to the SUCCESS callback with exists === false,
          // which the branch above already handles. So a no-op only ever
          // swallowed real errors, and `meta` staying null silently
          // disables the "ya no está en el CSV" badge the import handler
          // depends on. Record it instead of hiding it — but keep it out of
          // `error`, which would blank a perfectly working roster.
          (err) => {
            setState((s) => ({ ...s, metaError: err.message }));
          }
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
