export const MAX_TILES = 12;

export const ROTATE_MS = 6000;

export function tileCapacity(poolSize: number): number {
  return Math.min(MAX_TILES, poolSize);
}

export function reconcileTiles(
  tiles: readonly string[],
  pool: readonly string[]
): string[] {
  const live = new Set(pool);
  const kept = tiles.filter((id) => live.has(id));

  const capacity = tileCapacity(pool.length);
  const shown = new Set(kept);
  const next = [...kept];

  for (const id of pool) {
    if (next.length >= capacity) break;
    if (shown.has(id)) continue;
    next.push(id);
    shown.add(id);
  }

  return next.slice(0, capacity);
}

export interface Rotation {
  tiles: string[];
  cursor: number;

  queue: string[];
}

export const EMPTY_ROTATION: Rotation = { tiles: [], cursor: 0, queue: [] };

function selectNext(
  state: Rotation,
  pool: readonly string[],
  priority: readonly string[]
): { candidate: string | undefined; queue: string[] } {
  const shown = new Set(state.tiles);
  const approved = new Set(pool);

  let candidate = priority.find((id) => !shown.has(id) && approved.has(id));
  let queue = state.queue.filter((id) => approved.has(id) && !shown.has(id));

  if (candidate === undefined) {
    if (queue.length === 0) queue = pool.filter((id) => !shown.has(id));
    candidate = queue[0];
    queue = queue.slice(1);
  } else {
    queue = queue.filter((id) => id !== candidate);
  }

  return { candidate, queue };
}

export function peekNext(
  state: Rotation,
  pool: readonly string[],
  priority: readonly string[] = []
): string | null {
  if (state.tiles.length === 0) return null;
  return selectNext(state, pool, priority).candidate ?? null;
}

export function rotateTiles(
  state: Rotation,
  pool: readonly string[],
  priority: readonly string[] = []
): Rotation {
  const { tiles, cursor } = state;
  if (tiles.length === 0) return state;

  const { candidate, queue } = selectNext(state, pool, priority);
  if (candidate === undefined) return state;

  const at = cursor % tiles.length;
  const next = [...tiles];
  next[at] = candidate;
  return { tiles: next, cursor: (at + 1) % tiles.length, queue };
}
