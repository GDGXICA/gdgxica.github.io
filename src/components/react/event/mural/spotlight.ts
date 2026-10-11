export const SPOTLIGHT_MS = 6000;
export const SPOTLIGHT_BUSY_MS = 3500;
export const SPOTLIGHT_QUEUE_CAP = 5;

export interface SpotlightState {
  current: string | null;
  queue: string[];
}

export const EMPTY_SPOTLIGHT: SpotlightState = { current: null, queue: [] };

export function detectArrivals(
  seen: ReadonlySet<string>,
  newestFirst: readonly string[]
): string[] {
  return newestFirst.filter((id) => !seen.has(id)).reverse();
}

export function enqueue(
  state: SpotlightState,
  ids: readonly string[],
  cap = SPOTLIGHT_QUEUE_CAP
): { state: SpotlightState; overflow: string[] } {
  let current = state.current;
  const queue = [...state.queue];
  const overflow: string[] = [];

  for (const id of ids) {
    if (id === current || queue.includes(id)) continue;
    if (current === null) {
      current = id;
    } else if (queue.length < cap) {
      queue.push(id);
    } else {
      overflow.push(id);
    }
  }

  return { state: { current, queue }, overflow };
}

export function advance(state: SpotlightState): {
  state: SpotlightState;
  finished: string | null;
} {
  const [next = null, ...rest] = state.queue;
  return { state: { current: next, queue: rest }, finished: state.current };
}

export function spotlightDuration(state: SpotlightState): number {
  return state.queue.length > 0 ? SPOTLIGHT_BUSY_MS : SPOTLIGHT_MS;
}

export function prune(
  state: SpotlightState,
  live: ReadonlySet<string>
): SpotlightState {
  const queue = state.queue.filter((id) => live.has(id));
  const currentAlive = state.current === null || live.has(state.current);
  if (currentAlive && queue.length === state.queue.length) return state;
  if (currentAlive) return { current: state.current, queue };
  const [next = null, ...rest] = queue;
  return { current: next, queue: rest };
}
