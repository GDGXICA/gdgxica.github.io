import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MuralPhoto } from "@/lib/mural";
import { MuralTile } from "./MuralTile";
import {
  applyMembership,
  columnSpeed,
  offsetToTime,
  rowDirection,
  rowPeriod,
  timeToOffset,
  type RowGeometry,
} from "./ribbons";

interface Props {
  index: number;
  photos: readonly MuralPhoto[];
  heights: ReadonlyMap<string, number>;
  columnWidth: number;
  gap: number;
  viewportHeight: number;
  reducedMotion: boolean;
  paused: boolean;
  onBroken: (id: string) => void;
}

const SWEEP_MS = 1000;

function keyframesFor(direction: "left" | "right", period: number) {
  const start = { transform: "translate3d(0, 0, 0)" };
  const end = { transform: `translate3d(0, ${-period}px, 0)` };
  return direction === "left" ? [start, end] : [end, start];
}

function RibbonImpl({
  index,
  photos,
  heights,
  columnWidth,
  gap,
  viewportHeight,
  reducedMotion,
  paused,
  onBroken,
}: Props) {
  const direction = rowDirection(index);
  const speed = columnSpeed(index, columnWidth);

  const [order, setOrder] = useState<string[]>(() => photos.map((p) => p.id));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const trackRef = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const pendingOffset = useRef<number | null>(null);
  const known = useRef(new Map<string, MuralPhoto>());
  const knownHeights = useRef(new Map<string, number>());
  const orderRef = useRef(order);
  orderRef.current = order;

  for (const photo of photos) known.current.set(photo.id, photo);
  for (const [id, height] of heights) knownHeights.current.set(id, height);

  const geometryOf = useCallback(
    (ids: readonly string[]): RowGeometry => ({
      ids: [...ids],
      widths: ids.map((id) => knownHeights.current.get(id) ?? columnWidth),
      gap,
    }),
    [gap, columnWidth]
  );

  const currentOffset = useCallback(() => {
    if (pendingOffset.current !== null) return pendingOffset.current;
    const anim = animation.current;
    const period = rowPeriod(geometryOf(orderRef.current));
    if (!anim || anim.currentTime === null) return 0;
    return timeToOffset(Number(anim.currentTime), period, speed, direction);
  }, [direction, geometryOf, speed]);

  const sync = useCallback(() => {
    const target = photos.map((p) => ({
      id: p.id,
      width: knownHeights.current.get(p.id) ?? columnWidth,
    }));

    if (reducedMotion) {
      setOrder(target.map((t) => t.id));
      setHidden(new Set());
      return;
    }

    const result = applyMembership(
      geometryOf(orderRef.current),
      target,
      currentOffset(),
      viewportHeight,
      direction
    );
    const nextIds = result.geometry.ids;
    const sameOrder =
      nextIds.length === orderRef.current.length &&
      nextIds.every((id, i) => id === orderRef.current[i]);

    setHidden((prev) => {
      const next = new Set(result.deferred);
      return next.size === prev.size && [...next].every((id) => prev.has(id))
        ? prev
        : next;
    });
    if (sameOrder) return;
    pendingOffset.current = result.offset;
    setOrder(nextIds);
  }, [
    currentOffset,
    direction,
    geometryOf,
    photos,
    reducedMotion,
    columnWidth,
    viewportHeight,
  ]);

  useLayoutEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    if (hidden.size === 0) return;
    const timer = window.setInterval(sync, SWEEP_MS);
    return () => window.clearInterval(timer);
  }, [hidden, sync]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const period = rowPeriod(geometryOf(order));
    if (
      !track ||
      reducedMotion ||
      typeof track.animate !== "function" ||
      period <= 0
    ) {
      animation.current?.cancel();
      animation.current = null;
      pendingOffset.current = null;
      return;
    }

    const keyframes = keyframesFor(direction, period);
    const duration = (period / speed) * 1000;
    const offset = pendingOffset.current ?? 0;

    let anim = animation.current;
    if (!anim) {
      anim = track.animate(keyframes, {
        duration,
        iterations: Infinity,
        easing: "linear",
      });
      animation.current = anim;
    } else {
      (anim.effect as KeyframeEffect).setKeyframes(keyframes);
      anim.effect?.updateTiming({ duration });
    }
    anim.currentTime = offsetToTime(offset, period, speed, direction);
    pendingOffset.current = null;
  }, [direction, geometryOf, order, reducedMotion, speed]);

  useEffect(() => {
    const anim = animation.current;
    if (!anim) return;
    if (paused) anim.pause();
    else anim.play();
  }, [paused, order]);

  useEffect(
    () => () => {
      animation.current?.cancel();
      animation.current = null;
    },
    []
  );

  const period = rowPeriod(geometryOf(order));
  const tiles = order
    .map((id) => known.current.get(id))
    .filter((p): p is MuralPhoto => Boolean(p));

  return (
    <div
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: columnWidth }}
      data-direction={direction}
      data-speed={speed.toFixed(2)}
      data-period={Math.round(period)}
    >
      <div
        ref={trackRef}
        className="flex h-max flex-col will-change-transform"
        style={{ gap }}
      >
        {[false, true].map((copy) =>
          tiles.map((photo) => (
            <MuralTile
              key={`${photo.id}${copy ? "-copy" : ""}`}
              photo={photo}
              width={columnWidth}
              height={knownHeights.current.get(photo.id) ?? columnWidth}
              hidden={hidden.has(photo.id)}
              copy={copy}
              onBroken={onBroken}
            />
          ))
        )}
      </div>
    </div>
  );
}

export const Ribbon = memo(RibbonImpl);
