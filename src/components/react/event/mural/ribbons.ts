export const DEFAULT_ASPECT = 4 / 3;
export const ASPECT_MIN = 0.6;
export const ASPECT_MAX = 2;
export const MIN_ROW_HEIGHT = 160;
export const RIBBON_LENGTH = 2;
export const RIBBON_LENGTH_TO_KEEP = 1.75;
export const STATIC_HEIGHT_SHARE = 0.9;
export const STATIC_WIDTH_SHARE = 0.94;
export const STILL_MIN_HEIGHT_SHARE = 0.22;

const SPEED_PER_ROW_HEIGHT = 0.11;
const SPEED_FACTORS = [1, 0.8, 1.2];

export type Direction = "left" | "right";
export type WallMode = "empty" | "static" | "ribbons";

export interface WallPhoto {
  id: string;
  aspect: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface WallLayout {
  mode: WallMode;
  rows: string[][];
  rowHeight: number;
  gap: number;
}

export interface RowGeometry {
  ids: string[];
  widths: number[];
  gap: number;
}

export function photoAspect(width?: number, height?: number): number {
  if (!width || !height || width <= 0 || height <= 0) return DEFAULT_ASPECT;
  return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, width / height));
}

export function gapFor(rowHeight: number): number {
  return Math.min(16, Math.max(6, Math.round(rowHeight * 0.035)));
}

export function tileWidth(aspect: number, rowHeight: number): number {
  return Math.round(aspect * rowHeight);
}

export function distribute(
  photos: readonly WallPhoto[],
  rowCount: number,
  rowHeight: number,
  gap: number
): string[][] {
  const rows: string[][] = Array.from({ length: rowCount }, () => []);
  const lengths = new Array<number>(rowCount).fill(0);
  for (const photo of photos) {
    let shortest = 0;
    for (let i = 1; i < rowCount; i++) {
      if (lengths[i] < lengths[shortest]) shortest = i;
    }
    rows[shortest].push(photo.id);
    lengths[shortest] += tileWidth(photo.aspect, rowHeight) + gap;
  }
  return rows;
}

function rowLength(
  ids: readonly string[],
  aspects: ReadonlyMap<string, number>,
  rowHeight: number,
  gap: number
): number {
  return ids.reduce(
    (sum, id) =>
      sum + tileWidth(aspects.get(id) ?? DEFAULT_ASPECT, rowHeight) + gap,
    0
  );
}

function ribbonPlan(
  photos: readonly WallPhoto[],
  viewport: Viewport,
  rowCount: number,
  minimumLength: number
): WallLayout | null {
  const gap = gapFor(viewport.height / rowCount);
  const rowHeight = Math.floor(
    (viewport.height - (rowCount - 1) * gap) / rowCount
  );
  if (rowHeight < MIN_ROW_HEIGHT) return null;

  const rows = distribute(photos, rowCount, rowHeight, gap);
  const aspects = new Map(photos.map((p) => [p.id, p.aspect]));
  const shortest = Math.min(
    ...rows.map((row) => rowLength(row, aspects, rowHeight, gap))
  );
  if (shortest < minimumLength * viewport.width) return null;

  return { mode: "ribbons", rows, rowHeight, gap };
}

function staticPlan(
  photos: readonly WallPhoto[],
  viewport: Viewport
): WallLayout {
  let best: WallLayout | null = null;
  const usable = viewport.height * STATIC_HEIGHT_SHARE;
  const usableWidth = viewport.width * STATIC_WIDTH_SHARE;

  for (let rowCount = 1; rowCount <= Math.min(3, photos.length); rowCount++) {
    const gap = gapFor(usable / rowCount);
    const rows = distribute(photos, rowCount, 1, 0);
    const aspects = new Map(photos.map((p) => [p.id, p.aspect]));
    const byHeight = (usable - (rowCount - 1) * gap) / rowCount;
    const byWidth = Math.min(
      ...rows.map((row) => {
        const totalAspect = row.reduce(
          (sum, id) => sum + (aspects.get(id) ?? DEFAULT_ASPECT),
          0
        );
        return (usableWidth - (row.length - 1) * gap) / totalAspect;
      })
    );
    const rowHeight = Math.floor(Math.min(byHeight, byWidth));
    if (!best || rowHeight > best.rowHeight) {
      best = { mode: "static", rows, rowHeight, gap };
    }
  }

  return best ?? { mode: "empty", rows: [], rowHeight: 0, gap: 0 };
}

function stillPlan(
  photos: readonly WallPhoto[],
  viewport: Viewport
): WallLayout {
  const minimum = Math.max(
    MIN_ROW_HEIGHT,
    viewport.height * STILL_MIN_HEIGHT_SHARE
  );
  for (let count = photos.length; count > 1; count--) {
    const plan = staticPlan(photos.slice(0, count), viewport);
    if (plan.rowHeight >= minimum) return plan;
  }
  return staticPlan(photos.slice(0, 1), viewport);
}

export function planWall(
  photos: readonly WallPhoto[],
  viewport: Viewport,
  previous?: Pick<WallLayout, "mode" | "rows">,
  motion = true
): WallLayout {
  if (photos.length === 0) {
    return { mode: "empty", rows: [], rowHeight: 0, gap: 0 };
  }
  if (!motion) return stillPlan(photos, viewport);

  for (const rowCount of [3, 2]) {
    const keeping =
      previous?.mode === "ribbons" && previous.rows.length === rowCount;
    const plan = ribbonPlan(
      photos,
      viewport,
      rowCount,
      keeping ? RIBBON_LENGTH_TO_KEEP : RIBBON_LENGTH
    );
    if (plan) return plan;
  }

  return staticPlan(photos, viewport);
}

function sameShape(a: WallLayout, b: WallLayout): boolean {
  return (
    a.mode === b.mode &&
    a.rows.length === b.rows.length &&
    a.rowHeight === b.rowHeight &&
    a.gap === b.gap
  );
}

export function reconcileWall(
  previous: WallLayout | null,
  photos: readonly WallPhoto[],
  viewport: Viewport,
  motion = true
): { layout: WallLayout; replanned: boolean } {
  const plan = planWall(photos, viewport, previous ?? undefined, motion);
  if (!previous || !sameShape(plan, previous)) {
    return { layout: plan, replanned: true };
  }
  if (plan.mode !== "ribbons") return { layout: plan, replanned: false };

  const live = new Set(photos.map((p) => p.id));
  const aspects = new Map(photos.map((p) => [p.id, p.aspect]));
  const rows = previous.rows.map((row) => row.filter((id) => live.has(id)));
  const placed = new Set(rows.flat());
  const lengths = rows.map((row) =>
    rowLength(row, aspects, previous.rowHeight, previous.gap)
  );

  for (const photo of photos) {
    if (placed.has(photo.id)) continue;
    let shortest = 0;
    for (let i = 1; i < rows.length; i++) {
      if (lengths[i] < lengths[shortest]) shortest = i;
    }
    rows[shortest].push(photo.id);
    lengths[shortest] +=
      tileWidth(photo.aspect, previous.rowHeight) + previous.gap;
  }

  if (Math.min(...lengths) < RIBBON_LENGTH_TO_KEEP * viewport.width) {
    return { layout: plan, replanned: true };
  }
  return { layout: { ...previous, rows }, replanned: false };
}

export function rowSpeed(index: number, rowHeight: number): number {
  return (
    rowHeight *
    SPEED_PER_ROW_HEIGHT *
    SPEED_FACTORS[index % SPEED_FACTORS.length]
  );
}

export function rowDirection(index: number): Direction {
  return index % 2 === 0 ? "left" : "right";
}

export function rowPeriod(geometry: RowGeometry): number {
  return geometry.widths.reduce((sum, w) => sum + w + geometry.gap, 0);
}

function tileStarts(geometry: RowGeometry): number[] {
  const starts: number[] = [];
  let x = 0;
  for (const width of geometry.widths) {
    starts.push(x);
    x += width + geometry.gap;
  }
  return starts;
}

function wrap(value: number, period: number): number {
  if (period <= 0) return 0;
  const result = value % period;
  return result < 0 ? result + period : result;
}

export function screenPositions(
  geometry: RowGeometry,
  offset: number,
  viewportWidth: number
): Map<string, number[]> {
  const period = rowPeriod(geometry);
  const starts = tileStarts(geometry);
  const visible = new Map<string, number[]>();
  geometry.ids.forEach((id, i) => {
    for (const copy of [0, 1]) {
      const x = starts[i] + copy * period;
      if (x < offset + viewportWidth && x + geometry.widths[i] > offset) {
        visible.set(id, [...(visible.get(id) ?? []), x - offset]);
      }
    }
  });
  return visible;
}

export function pickInsertion(
  geometry: RowGeometry,
  offset: number,
  viewportWidth: number,
  direction: Direction,
  margin = 0
): number {
  const period = rowPeriod(geometry);
  const starts = tileStarts(geometry);
  const count = starts.length;
  if (count === 0) return 0;

  const first = Math.floor((offset - viewportWidth - margin) / period) - 1;
  const last = Math.ceil((offset + viewportWidth + margin) / period) + 1;
  const copies = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const candidates = starts.flatMap((x, index) =>
    copies.map((copy) => ({ index, at: x + copy * period }))
  );

  if (direction === "left") {
    const edge = offset + viewportWidth + margin;
    const after = candidates
      .filter((c) => c.at >= edge)
      .sort((a, b) => a.at - b.at)[0];
    return after.index === 0 ? count : after.index;
  }

  const edge = offset - margin;
  const before = candidates
    .filter((c) => c.at <= edge)
    .sort((a, b) => b.at - a.at)[0];
  return before.index === 0 ? count : before.index;
}

function anchorOffset(
  before: RowGeometry,
  after: RowGeometry,
  offset: number,
  viewportWidth: number
): number {
  const periodBefore = rowPeriod(before);
  const periodAfter = rowPeriod(after);
  const startsBefore = tileStarts(before);
  const startsAfter = tileStarts(after);

  for (let i = 0; i < before.ids.length; i++) {
    for (const copy of [0, 1]) {
      const x = startsBefore[i] + copy * periodBefore;
      if (x >= offset + viewportWidth || x + before.widths[i] <= offset) {
        continue;
      }
      const j = after.ids.indexOf(before.ids[i]);
      if (j === -1) continue;
      const screen = x - offset;
      return wrap(startsAfter[j] + copy * periodAfter - screen, periodAfter);
    }
  }
  return wrap(offset, periodAfter);
}

export function applyMembership(
  geometry: RowGeometry,
  target: readonly { id: string; width: number }[],
  offset: number,
  viewportWidth: number,
  direction: Direction
): { geometry: RowGeometry; offset: number; deferred: string[] } {
  let current: RowGeometry = {
    ids: [...geometry.ids],
    widths: [...geometry.widths],
    gap: geometry.gap,
  };
  let currentOffset = offset;
  const wanted = new Set(target.map((t) => t.id));
  const deferred: string[] = [];

  for (const id of geometry.ids) {
    if (wanted.has(id)) continue;
    if (screenPositions(current, currentOffset, viewportWidth).has(id)) {
      deferred.push(id);
      continue;
    }
    const index = current.ids.indexOf(id);
    const next: RowGeometry = {
      ids: current.ids.filter((_, i) => i !== index),
      widths: current.widths.filter((_, i) => i !== index),
      gap: current.gap,
    };
    currentOffset = anchorOffset(current, next, currentOffset, viewportWidth);
    current = next;
  }

  for (const tile of target) {
    if (current.ids.includes(tile.id)) continue;
    const index = pickInsertion(
      current,
      currentOffset,
      viewportWidth,
      direction,
      current.gap
    );
    const next: RowGeometry = {
      ids: [
        ...current.ids.slice(0, index),
        tile.id,
        ...current.ids.slice(index),
      ],
      widths: [
        ...current.widths.slice(0, index),
        tile.width,
        ...current.widths.slice(index),
      ],
      gap: current.gap,
    };
    currentOffset =
      current.ids.length === 0
        ? 0
        : anchorOffset(current, next, currentOffset, viewportWidth);
    current = next;
  }

  return { geometry: current, offset: currentOffset, deferred };
}

export function offsetToTime(
  offset: number,
  period: number,
  speed: number,
  direction: Direction
): number {
  if (period <= 0 || speed <= 0) return 0;
  const distance =
    direction === "left" ? wrap(offset, period) : wrap(period - offset, period);
  return (distance / speed) * 1000;
}

export function timeToOffset(
  time: number,
  period: number,
  speed: number,
  direction: Direction
): number {
  if (period <= 0 || speed <= 0) return 0;
  const distance = wrap((time / 1000) * speed, period);
  return direction === "left" ? distance : wrap(period - distance, period);
}
