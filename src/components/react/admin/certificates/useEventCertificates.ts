import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type CertificateItem,
  type CertificateSettings,
  type EventCertificates,
} from "@/lib/api";

/** How often to ask for changes while something is on its way. */
export const POLL_MS = 5000;

// A poll asks for documents changed after the last server time it saw,
// minus this margin: server timestamps are written a moment after the
// response that reported "now".
const SINCE_MARGIN_MS = 5000;

const inFlight = (i: CertificateItem) =>
  i.status === "queued" || i.status === "sending";

/** Replaces items by id; attendees keep their roster-only fields. */
function merge(list: CertificateItem[], changes: CertificateItem[]) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  const out = list.map((item) => {
    const change = byId.get(item.id);
    if (!change) return item;
    byId.delete(item.id);
    return {
      ...change,
      rosterId: item.rosterId ?? change.rosterId,
      checkin: item.checkin,
    };
  });
  return { out, rest: [...byId.values()] };
}

export function applyChanges(
  data: EventCertificates,
  changes: CertificateItem[]
): EventCertificates {
  const attendees = merge(data.attendees, changes);
  const people = merge(
    data.people,
    attendees.rest.filter((c) => c.kind !== "attendee")
  );
  return {
    ...data,
    attendees: attendees.out,
    people: [...people.out, ...people.rest],
  };
}

/**
 * The event's certificates, kept fresh while anything is queued or being
 * sent: polls for changes only, never the whole list, and only while the
 * tab is visible.
 */
export function useEventCertificates(slug: string, pollMs = POLL_MS) {
  const [data, setData] = useState<EventCertificates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const since = useRef(0);

  const load = useCallback(async () => {
    setError(null);
    const res = await api.getEventCertificates(slug);
    if (!res.success || !res.data) {
      setError(res.error || "No se pudieron cargar los certificados.");
      return;
    }
    since.current = res.data.serverTime - SINCE_MARGIN_MS;
    setData(res.data);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy =
    !!data && (data.attendees.some(inFlight) || data.people.some(inFlight));

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await api.pollEventCertificates(slug, since.current);
      if (!res.success || !res.data) return;
      since.current = res.data.serverTime - SINCE_MARGIN_MS;
      const { changes } = res.data;
      if (changes.length > 0) {
        setData((d) => (d ? applyChanges(d, changes) : d));
      }
    }, pollMs);
    return () => clearInterval(timer);
  }, [busy, slug, pollMs]);

  /** After an edit: the item as the server returned it. */
  const replace = useCallback(
    (item: CertificateItem, previousId?: string | null) => {
      setData((d) => {
        if (!d) return d;
        const people = previousId
          ? d.people.filter((p) => p.id !== previousId)
          : d.people;
        return applyChanges({ ...d, people }, [item]);
      });
    },
    []
  );

  const remove = useCallback((id: string) => {
    setData((d) =>
      d ? { ...d, people: d.people.filter((p) => p.id !== id) } : d
    );
  }, []);

  const setSettings = useCallback((settings: CertificateSettings) => {
    setData((d) => (d ? { ...d, settings, settingsSaved: true } : d));
  }, []);

  /** Marks items queued locally until the next poll confirms it. */
  const markQueued = useCallback((ids: Set<string>) => {
    const queue = (i: CertificateItem): CertificateItem =>
      ids.has(i.id) || (i.rosterId !== null && ids.has(i.rosterId))
        ? { ...i, status: "queued", lastError: null }
        : i;
    setData((d) =>
      d
        ? {
            ...d,
            attendees: d.attendees.map(queue),
            people: d.people.map(queue),
          }
        : d
    );
  }, []);

  return { data, error, load, replace, remove, setSettings, markQueued };
}
