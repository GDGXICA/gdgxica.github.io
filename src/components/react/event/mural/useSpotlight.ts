import { useEffect, useMemo, useRef, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";
import {
  EMPTY_SPOTLIGHT,
  advance,
  detectArrivals,
  enqueue,
  prune,
  spotlightDuration,
  type SpotlightState,
} from "./spotlight";

export const SPOTLIGHT_WAIT_MS = 15_000;
export const SPOTLIGHT_EXIT_MS = 500;

export function useSpotlight(
  photos: readonly MuralPhoto[],
  loading: boolean,
  synced: boolean,
  ready: ReadonlyMap<string, unknown>,
  broken: ReadonlySet<string>
): {
  current: MuralPhoto | null;
  leaving: boolean;
  held: ReadonlySet<string>;
} {
  const [state, setState] = useState<SpotlightState>(EMPTY_SPOTLIGHT);
  const [pending, setPending] = useState<ReadonlyMap<string, number>>(
    () => new Map()
  );
  const [leaving, setLeaving] = useState(false);
  const seen = useRef(new Set<string>());
  const baselined = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const live = useMemo(() => new Set(photos.map((p) => p.id)), [photos]);

  useEffect(() => {
    if (loading) return;
    const ids = photos.map((p) => p.id);
    if (!baselined.current) {
      for (const id of ids) seen.current.add(id);
      baselined.current = synced;
      return;
    }
    const arrivals = detectArrivals(seen.current, ids);
    if (arrivals.length > 0) {
      for (const id of arrivals) seen.current.add(id);
      const now = Date.now();
      setPending((prev) => {
        const next = new Map(prev);
        for (const id of arrivals) next.set(id, now);
        return next;
      });
    }
    setState((prev) => prune(prev, live));
  }, [photos, loading, synced, live]);

  useEffect(() => {
    if (pending.size === 0) return;
    const now = Date.now();
    const promote: string[] = [];
    const next = new Map(pending);
    for (const [id, arrivedAt] of pending) {
      if (
        !live.has(id) ||
        broken.has(id) ||
        now - arrivedAt > SPOTLIGHT_WAIT_MS
      ) {
        next.delete(id);
      } else if (ready.has(id)) {
        promote.push(id);
        next.delete(id);
      }
    }
    if (next.size === pending.size) return;
    setPending(next);
    if (promote.length > 0) {
      setState((prev) => enqueue(prev, promote).state);
    }
  }, [pending, ready, broken, live]);

  useEffect(() => {
    const id = state.current;
    if (id === null) return;
    setLeaving(false);
    const duration = spotlightDuration(stateRef.current);
    let exitTimer = 0;
    let endTimer = 0;

    const finish = () => {
      if (document.hidden) {
        endTimer = window.setTimeout(finish, 1000);
        return;
      }
      setLeaving(true);
      exitTimer = window.setTimeout(() => {
        setLeaving(false);
        setState((prev) => (prev.current === id ? advance(prev).state : prev));
      }, SPOTLIGHT_EXIT_MS);
    };

    endTimer = window.setTimeout(finish, duration - SPOTLIGHT_EXIT_MS);
    return () => {
      window.clearTimeout(endTimer);
      window.clearTimeout(exitTimer);
    };
  }, [state.current]);

  const byId = useMemo(
    () => new Map(photos.map((p) => [p.id, p] as const)),
    [photos]
  );

  const held = useMemo(() => {
    const ids = new Set<string>(pending.keys());
    if (state.current) ids.add(state.current);
    for (const id of state.queue) ids.add(id);
    return ids;
  }, [pending, state]);

  return {
    current: state.current ? (byId.get(state.current) ?? null) : null,
    leaving,
    held,
  };
}
