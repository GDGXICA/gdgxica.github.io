import { describe, expect, it } from "vitest";
import {
  COLUMNS_MAX,
  COLUMNS_MIN,
  DEFAULT_ASPECT,
  RIBBON_LENGTH,
  RIBBON_LENGTH_TO_KEEP,
  STILL_MIN_HEIGHT_SHARE,
  TILE_SCALE_MAX,
  TILE_SCALE_MIN,
  applyMembership,
  columnCount,
  columnGap,
  columnSpeed,
  columnTileHeight,
  columnWidths,
  distribute,
  offsetToTime,
  photoAspect,
  photoIdOf,
  pickInsertion,
  planWall,
  reconcileWall,
  rowDirection,
  rowPeriod,
  screenPositions,
  timeToOffset,
  type Direction,
  type RowGeometry,
  type WallPhoto,
} from "../ribbons";

const FULL_HD = { width: 1920, height: 1080 };

function photos(count: number, aspect = 1.25): WallPhoto[] {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, aspect }));
}

function geometry(widths: number[], gap = 12): RowGeometry {
  return { ids: widths.map((_, i) => `t${i}`), widths, gap };
}

function rowWidth(ids: string[], aspects: Map<string, number>, h: number) {
  return ids.reduce((sum, id) => sum + (aspects.get(id) ?? 0) * h, 0);
}

describe("photoAspect", () => {
  it("usa el ancho y alto reales", () => {
    expect(photoAspect(1600, 1200)).toBeCloseTo(4 / 3);
    expect(photoAspect(1200, 1600)).toBeCloseTo(0.75);
  });

  it("recorta panorámicas y retratos extremos a los límites", () => {
    expect(photoAspect(3000, 500)).toBe(2);
    expect(photoAspect(300, 1600)).toBe(0.6);
  });

  it("cae a 4:3 si falta el tamaño", () => {
    expect(photoAspect(0, 0)).toBe(DEFAULT_ASPECT);
    expect(photoAspect(undefined, 900)).toBe(DEFAULT_ASPECT);
  });
});

describe("distribute", () => {
  it("no pierde ni duplica fotos", () => {
    const list = photos(17);
    const rows = distribute(list, 3, 300, 12);
    expect(rows.flat().sort()).toEqual(list.map((p) => p.id).sort());
  });

  it("equilibra el ancho: las filas difieren en menos de una foto", () => {
    const list = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      aspect: [0.75, 1.33, 1.5, 2, 0.6][i % 5],
    }));
    const aspects = new Map(list.map((p) => [p.id, p.aspect]));
    const rows = distribute(list, 3, 300, 0);
    const widths = rows.map((r) => rowWidth(r, aspects, 300));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(
      2 * 300
    );
  });

  it("mantiene primero las más nuevas dentro de cada fila", () => {
    const rows = distribute(photos(9), 3, 300, 12);
    for (const row of rows) {
      const order = row.map((id) => Number(id.slice(1)));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});

function columnLengths(layout: ReturnType<typeof planWall>, aspect = 1.25) {
  return layout.rows.map((keys, i) =>
    keys.reduce(
      (sum, key) =>
        sum + columnTileHeight(aspect, key, layout.colWidths[i]) + layout.gap,
      0
    )
  );
}

describe("columnas", () => {
  it("el número de columnas sigue el ancho y queda acotado", () => {
    expect(columnCount(390)).toBe(COLUMNS_MIN);
    expect(columnCount(1920)).toBe(5);
    expect(columnCount(5000)).toBe(COLUMNS_MAX);
  });

  it("los anchos suman el ancho de pantalla menos los huecos y no son iguales", () => {
    const gap = columnGap(1920);
    const widths = columnWidths(1920, 5, gap);
    expect(widths.reduce((a, b) => a + b, 0) + 4 * gap).toBe(1920);
    expect(new Set(widths).size).toBeGreaterThan(1);
  });

  it("el alto de cada foto respeta su proporción con una variación acotada", () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      const height = columnTileHeight(1.5, id, 300);
      expect(height).toBeGreaterThanOrEqual(
        Math.floor(300 / (1.5 * TILE_SCALE_MAX))
      );
      expect(height).toBeLessThanOrEqual(
        Math.ceil(300 / (1.5 * TILE_SCALE_MIN))
      );
    }
    expect(columnTileHeight(0.75, "a", 300)).toBeGreaterThan(
      columnTileHeight(1.5, "a", 300)
    );
  });

  it("dos fotos iguales pueden medir distinto", () => {
    const heights = new Set(
      Array.from({ length: 20 }, (_, i) => columnTileHeight(1.25, `p${i}`, 300))
    );
    expect(heights.size).toBeGreaterThan(3);
  });

  it("las repetidas conservan el id de la foto", () => {
    expect(photoIdOf("abc")).toBe("abc");
    expect(photoIdOf("abc~3")).toBe("abc");
  });
});

describe("planWall", () => {
  it("sin fotos no hay pared", () => {
    expect(planWall([], FULL_HD).mode).toBe("empty");
  });

  for (const count of [1, 3, 8]) {
    it(`con ${count} fotos hay columnas en movimiento que llenan la pantalla`, () => {
      const plan = planWall(photos(count), FULL_HD);
      expect(plan.mode).toBe("ribbons");
      expect(plan.rows).toHaveLength(5);
      expect(plan.repeats).toBe(true);
      for (const length of columnLengths(plan)) {
        expect(length).toBeGreaterThanOrEqual(RIBBON_LENGTH * FULL_HD.height);
      }
      const used = new Set(plan.rows.flat().map(photoIdOf));
      expect(used.size).toBe(count);
    });
  }

  it("las repeticiones usan claves únicas dentro de cada columna", () => {
    const plan = planWall(photos(3), FULL_HD);
    for (const keys of plan.rows) {
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("las columnas contiguas no empiezan por la misma foto", () => {
    const plan = planWall(photos(8), FULL_HD);
    for (let i = 1; i < plan.rows.length; i++) {
      expect(photoIdOf(plan.rows[i][0])).not.toBe(
        photoIdOf(plan.rows[i - 1][0])
      );
    }
  });

  it("con fotos de sobra no repite ninguna", () => {
    const list = photos(60);
    const plan = planWall(list, FULL_HD);
    expect(plan.repeats).toBe(false);
    expect([...plan.rows.flat()].sort()).toEqual(list.map((p) => p.id).sort());
    for (const length of columnLengths(plan)) {
      expect(length).toBeGreaterThanOrEqual(RIBBON_LENGTH * FULL_HD.height);
    }
  });

  it("en celular usa dos columnas", () => {
    expect(planWall(photos(10), { width: 390, height: 844 }).rows).toHaveLength(
      2
    );
  });

  it("sin movimiento deja quietas las fotos más nuevas que caben", () => {
    const plan = planWall(photos(40), FULL_HD, false);
    expect(plan.mode).toBe("static");
    expect(plan.rowHeight).toBeGreaterThanOrEqual(
      FULL_HD.height * STILL_MIN_HEIGHT_SHARE
    );
    const shown = plan.rows.flat();
    expect(shown).toContain("p0");
    expect(shown).not.toContain("p39");
  });
});

describe("reconcileWall", () => {
  it("manda una foto nueva a la columna más corta sin barajar las demás", () => {
    const first = reconcileWall(null, photos(80), FULL_HD).layout;
    expect(first.repeats).toBe(false);
    const lengths = columnLengths(first);
    const shortest = lengths.indexOf(Math.min(...lengths));
    const next = reconcileWall(
      first,
      [{ id: "nueva", aspect: 1.25 }, ...photos(80)],
      FULL_HD
    );
    expect(next.replanned).toBe(false);
    expect(next.layout.rows[shortest]).toContain("nueva");
    next.layout.rows.forEach((row, i) =>
      expect(row.filter((id) => id !== "nueva")).toEqual(first.rows[i])
    );
  });

  it("con las mismas fotos no vuelve a planear", () => {
    const first = reconcileWall(null, photos(3), FULL_HD).layout;
    const next = reconcileWall(first, photos(3), FULL_HD);
    expect(next.replanned).toBe(false);
    expect(next.layout).toBe(first);
  });

  it("con repeticiones, una foto nueva re-planea", () => {
    const first = reconcileWall(null, photos(3), FULL_HD).layout;
    const next = reconcileWall(first, photos(4), FULL_HD);
    expect(next.replanned).toBe(true);
    expect(new Set(next.layout.rows.flat().map(photoIdOf)).size).toBe(4);
  });

  it("vuelve a planear si las bajas dejan una columna demasiado corta", () => {
    const first = reconcileWall(null, photos(80), FULL_HD).layout;
    const gone = new Set(first.rows[0].slice(2));
    const next = reconcileWall(
      first,
      photos(80).filter((p) => !gone.has(p.id)),
      FULL_HD
    );
    expect(next.replanned).toBe(true);
    const lengths = columnLengths(next.layout);
    if (!next.layout.repeats) {
      for (const length of lengths) {
        expect(length).toBeGreaterThanOrEqual(
          RIBBON_LENGTH_TO_KEEP * FULL_HD.height
        );
      }
    }
  });

  it("vuelve a planear si cambia el tamaño de la pantalla", () => {
    const first = reconcileWall(null, photos(80), FULL_HD).layout;
    const next = reconcileWall(first, photos(80), { width: 1280, height: 720 });
    expect(next.replanned).toBe(true);
  });
});

describe("columnSpeed y rowDirection", () => {
  it("cada columna va a su velocidad, proporcional a su ancho", () => {
    const speeds = [0, 1, 2, 3, 4].map((i) => columnSpeed(i, 300));
    expect(new Set(speeds).size).toBe(5);
    expect(columnSpeed(0, 600)).toBeCloseTo(2 * columnSpeed(0, 300));
  });

  it("los sentidos se alternan", () => {
    expect([0, 1, 2, 3].map(rowDirection)).toEqual([
      "left",
      "right",
      "left",
      "right",
    ]);
  });
});

describe("offsetToTime y timeToOffset", () => {
  it("van y vuelven en ambos sentidos", () => {
    for (const direction of ["left", "right"] as Direction[]) {
      for (const offset of [0, 1, 250.5, 999]) {
        const time = offsetToTime(offset, 1000, 40, direction);
        expect(timeToOffset(time, 1000, 40, direction)).toBeCloseTo(offset);
      }
    }
  });
});

const WIDTHS = [320, 410, 280, 500, 360, 300, 450, 390, 270, 430, 350, 310];
const VIEWPORT = 1600;

function sweep(geo: RowGeometry) {
  const period = rowPeriod(geo);
  return Array.from({ length: 97 }, (_, i) => (i * period) / 97);
}

describe("pickInsertion", () => {
  for (const direction of ["left", "right"] as Direction[]) {
    it(`deja la foto nueva fuera de pantalla (${direction})`, () => {
      const geo = geometry([...WIDTHS, ...WIDTHS]);
      for (const offset of sweep(geo)) {
        const result = applyMembership(
          geo,
          [
            ...geo.ids.map((id, i) => ({ id, width: geo.widths[i] })),
            { id: "nueva", width: 400 },
          ],
          offset,
          VIEWPORT,
          direction
        );
        const seen = screenPositions(result.geometry, result.offset, VIEWPORT);
        expect(seen.has("nueva")).toBe(false);
      }
    });
  }

  for (const direction of ["left", "right"] as Direction[]) {
    it(`no falla con una fila más corta que la pantalla (${direction})`, () => {
      const geo = geometry([300, 280]);
      for (const offset of sweep(geo)) {
        const result = applyMembership(
          geo,
          [
            ...geo.ids.map((id, i) => ({ id, width: geo.widths[i] })),
            { id: "nueva", width: 400 },
          ],
          offset,
          VIEWPORT,
          direction
        );
        expect(result.geometry.ids).toContain("nueva");
      }
    });
  }

  it("entra por el borde derecho cuando la fila va a la izquierda", () => {
    const geo = geometry([...WIDTHS, ...WIDTHS]);
    const index = pickInsertion(geo, 0, VIEWPORT, "left");
    const starts = geo.widths.reduce<number[]>(
      (acc, w, i) => [
        ...acc,
        i === 0 ? 0 : acc[i - 1] + geo.widths[i - 1] + geo.gap,
      ],
      []
    );
    expect(starts[index] ?? rowPeriod(geo)).toBeGreaterThanOrEqual(VIEWPORT);
  });
});

describe("applyMembership", () => {
  for (const direction of ["left", "right"] as Direction[]) {
    it(`una foto que entra no mueve nada de lo visible (${direction})`, () => {
      const geo = geometry([...WIDTHS, ...WIDTHS]);
      for (const offset of sweep(geo)) {
        const before = screenPositions(geo, offset, VIEWPORT);
        const result = applyMembership(
          geo,
          [
            ...geo.ids.map((id, i) => ({ id, width: geo.widths[i] })),
            { id: "nueva", width: 380 },
          ],
          offset,
          VIEWPORT,
          direction
        );
        const after = screenPositions(result.geometry, result.offset, VIEWPORT);
        for (const [id, xs] of before) {
          expect(after.get(id)).toBeDefined();
          after.get(id)!.forEach((x, i) => expect(x).toBeCloseTo(xs[i], 6));
        }
      }
    });

    it(`una foto que sale fuera de pantalla no mueve nada (${direction})`, () => {
      const geo = geometry([...WIDTHS, ...WIDTHS]);
      for (const offset of sweep(geo)) {
        const before = screenPositions(geo, offset, VIEWPORT);
        const gone = geo.ids.find((id) => !before.has(id))!;
        const result = applyMembership(
          geo,
          geo.ids
            .map((id, i) => ({ id, width: geo.widths[i] }))
            .filter((t) => t.id !== gone),
          offset,
          VIEWPORT,
          direction
        );
        expect(result.geometry.ids).not.toContain(gone);
        expect(result.deferred).toEqual([]);
        const after = screenPositions(result.geometry, result.offset, VIEWPORT);
        for (const [id, xs] of before) {
          after.get(id)!.forEach((x, i) => expect(x).toBeCloseTo(xs[i], 6));
        }
      }
    });
  }

  it("aplaza la salida de una foto que está en pantalla", () => {
    const geo = geometry([...WIDTHS, ...WIDTHS]);
    const visible = [...screenPositions(geo, 0, VIEWPORT).keys()][0];
    const result = applyMembership(
      geo,
      geo.ids
        .map((id, i) => ({ id, width: geo.widths[i] }))
        .filter((t) => t.id !== visible),
      0,
      VIEWPORT,
      "left"
    );
    expect(result.deferred).toEqual([visible]);
    expect(result.geometry.ids).toContain(visible);
    expect(result.offset).toBe(0);
  });
});
