import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";
import { MuralTile } from "./MuralTile";
import { Ribbon } from "./Ribbon";
import {
  reconcileWall,
  tileWidth,
  type Viewport,
  type WallLayout,
} from "./ribbons";

interface Props {
  photos: readonly MuralPhoto[];
  aspects: ReadonlyMap<string, number>;
  reducedMotion: boolean;
  paused: boolean;
  onBroken: (id: string) => void;
}

const RESIZE_DEBOUNCE_MS = 150;

function measure(element: HTMLElement | null): Viewport {
  const width = element?.clientWidth || window.innerWidth;
  const height = element?.clientHeight || window.innerHeight;
  return { width, height };
}

function sameRows(a: WallLayout, b: WallLayout): boolean {
  return (
    a.rows.length === b.rows.length &&
    a.rows.every(
      (row, i) =>
        row.length === b.rows[i].length &&
        row.every((id, j) => id === b.rows[i][j])
    )
  );
}

export function RibbonWall({
  photos,
  aspects,
  reducedMotion,
  paused,
  onBroken,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const shown = useRef(new Set<string>());
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [wall, setWall] = useState<{
    layout: WallLayout;
    epoch: number;
  } | null>(null);

  useLayoutEffect(() => {
    setViewport(measure(container.current));
  }, []);

  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => setViewport(measure(container.current)),
        RESIZE_DEBOUNCE_MS
      );
    };
    const observer =
      typeof ResizeObserver === "function" && container.current
        ? new ResizeObserver(update)
        : null;
    if (observer && container.current) observer.observe(container.current);
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const wallPhotos = useMemo(
    () => photos.map((p) => ({ id: p.id, aspect: aspects.get(p.id) ?? 4 / 3 })),
    [photos, aspects]
  );

  useLayoutEffect(() => {
    if (!viewport) return;
    setWall((prev) => {
      const { layout, replanned } = reconcileWall(
        prev?.layout ?? null,
        wallPhotos,
        viewport,
        !reducedMotion
      );
      if (prev && !replanned && sameRows(layout, prev.layout)) return prev;
      const fresh =
        !prev ||
        (replanned &&
          (layout.mode === "ribbons" || layout.mode !== prev.layout.mode));
      return { layout, epoch: (prev?.epoch ?? 0) + (fresh ? 1 : 0) };
    });
  }, [wallPhotos, viewport, reducedMotion]);

  const byId = useMemo(
    () => new Map(photos.map((p) => [p.id, p] as const)),
    [photos]
  );

  const layout = wall?.layout;
  const widths = useMemo(() => {
    const map = new Map<string, number>();
    if (!layout) return map;
    for (const photo of wallPhotos) {
      map.set(photo.id, tileWidth(photo.aspect, layout.rowHeight));
    }
    return map;
  }, [layout, wallPhotos]);

  useEffect(() => {
    for (const row of layout?.rows ?? []) {
      for (const id of row) shown.current.add(id);
    }
  }, [layout]);

  const rowPhotos = useMemo(
    () =>
      (layout?.rows ?? []).map((row) =>
        row.map((id) => byId.get(id)).filter((p): p is MuralPhoto => Boolean(p))
      ),
    [layout, byId]
  );

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-hidden"
      data-mode={layout?.mode ?? "empty"}
      data-rows={layout?.rows.length ?? 0}
      data-epoch={wall?.epoch ?? 0}
    >
      {layout && viewport && layout.mode !== "empty" && (
        <div
          key={wall.epoch}
          className="animate-mural-fade-in flex h-full w-full flex-col justify-center"
          style={{ gap: layout.gap }}
        >
          {layout.mode === "ribbons"
            ? rowPhotos.map((row, i) => (
                <Ribbon
                  key={i}
                  index={i}
                  photos={row}
                  widths={widths}
                  rowHeight={layout.rowHeight}
                  gap={layout.gap}
                  viewportWidth={viewport.width}
                  reducedMotion={reducedMotion}
                  paused={paused}
                  onBroken={onBroken}
                />
              ))
            : rowPhotos.map((row, i) => (
                <div
                  key={i}
                  className="flex justify-center"
                  style={{ gap: layout.gap }}
                >
                  {row.map((photo) => (
                    <MuralTile
                      key={photo.id}
                      photo={photo}
                      width={widths.get(photo.id) ?? layout.rowHeight}
                      height={layout.rowHeight}
                      entering={!shown.current.has(photo.id)}
                      onBroken={onBroken}
                    />
                  ))}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
