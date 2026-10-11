import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASPECT,
  MIN_ROW_HEIGHT,
  RIBBON_LENGTH_TO_KEEP,
  STILL_MIN_HEIGHT_SHARE,
  applyMembership,
  distribute,
  offsetToTime,
  photoAspect,
  pickInsertion,
  planWall,
  reconcileWall,
  rowDirection,
  rowPeriod,
  rowSpeed,
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

describe("planWall", () => {
  it("sin fotos no hay pared", () => {
    expect(planWall([], FULL_HD).mode).toBe("empty");
  });

  it("con pocas fotos usa filas quietas y no repite ninguna", () => {
    const plan = planWall(photos(3), FULL_HD);
    expect(plan.mode).toBe("static");
    expect(plan.rows.flat()).toHaveLength(3);
    expect(new Set(plan.rows.flat()).size).toBe(3);
  });

  it("las filas quietas caben en la pantalla", () => {
    const plan = planWall(photos(8), FULL_HD);
    expect(plan.mode).toBe("static");
    for (const row of plan.rows) {
      const width =
        row.length * plan.rowHeight * 1.25 + (row.length - 1) * plan.gap;
      expect(width).toBeLessThanOrEqual(FULL_HD.width);
    }
    const height =
      plan.rows.length * plan.rowHeight + (plan.rows.length - 1) * plan.gap;
    expect(height).toBeLessThanOrEqual(FULL_HD.height);
  });

  it("pasa a dos cintas y luego a tres según crece el contenido", () => {
    expect(planWall(photos(14), FULL_HD)).toMatchObject({
      mode: "ribbons",
      rows: expect.any(Array),
    });
    expect(planWall(photos(14), FULL_HD).rows).toHaveLength(2);
    expect(planWall(photos(40), FULL_HD).rows).toHaveLength(3);
  });

  it("en cintas cada fila mide al menos dos anchos de pantalla", () => {
    const plan = planWall(photos(40), FULL_HD);
    const aspects = new Map(photos(40).map((p) => [p.id, p.aspect]));
    for (const row of plan.rows) {
      const length =
        rowWidth(row, aspects, plan.rowHeight) + row.length * plan.gap;
      expect(length).toBeGreaterThanOrEqual(2 * FULL_HD.width);
    }
  });

  it("el alto de fila sale del alto disponible y los huecos", () => {
    const plan = planWall(photos(40), FULL_HD);
    expect(plan.rowHeight * 3 + plan.gap * 2).toBeLessThanOrEqual(1080);
    expect(plan.rowHeight).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT);
  });

  it("no cambia de modo por una foto de menos (histéresis)", () => {
    let count = 40;
    while (planWall(photos(count - 1), FULL_HD).rows.length === 3) count--;
    const atEdge = planWall(photos(count), FULL_HD);
    expect(atEdge.rows).toHaveLength(3);
    expect(planWall(photos(count - 1), FULL_HD, atEdge).rows).toHaveLength(3);
  });

  it("sin movimiento deja quietas las fotos más nuevas que caben", () => {
    const plan = planWall(photos(40), FULL_HD, undefined, false);
    expect(plan.mode).toBe("static");
    expect(plan.rowHeight).toBeGreaterThanOrEqual(
      FULL_HD.height * STILL_MIN_HEIGHT_SHARE
    );
    const shown = plan.rows.flat();
    expect(shown).toContain("p0");
    expect(shown).not.toContain("p39");
    expect([...shown].sort()).toEqual(
      photos(shown.length)
        .map((p) => p.id)
        .sort()
    );
  });
});

describe("reconcileWall", () => {
  it("manda una foto nueva a la fila más corta sin barajar las demás", () => {
    const first = reconcileWall(null, photos(40), FULL_HD).layout;
    const shortest = first.rows
      .map((row, i) => ({ i, n: row.length }))
      .sort((a, b) => a.n - b.n)[0].i;
    const next = reconcileWall(
      first,
      [{ id: "nueva", aspect: 1.25 }, ...photos(40)],
      FULL_HD
    );
    expect(next.replanned).toBe(false);
    expect(next.layout.rows[shortest]).toContain("nueva");
    next.layout.rows.forEach((row, i) =>
      expect(row.filter((id) => id !== "nueva")).toEqual(first.rows[i])
    );
  });

  it("vuelve a planear si las bajas dejan una fila demasiado corta", () => {
    const first = reconcileWall(null, photos(60), FULL_HD).layout;
    const gone = new Set(first.rows[0].slice(2));
    const next = reconcileWall(
      first,
      photos(60).filter((p) => !gone.has(p.id)),
      FULL_HD
    );
    expect(next.replanned).toBe(true);
    const aspects = new Map(photos(60).map((p) => [p.id, p.aspect]));
    for (const row of next.layout.rows) {
      const length =
        rowWidth(row, aspects, next.layout.rowHeight) +
        row.length * next.layout.gap;
      expect(length).toBeGreaterThanOrEqual(
        RIBBON_LENGTH_TO_KEEP * FULL_HD.width
      );
    }
  });

  it("vuelve a planear si cambia el tamaño de la pantalla", () => {
    const first = reconcileWall(null, photos(40), FULL_HD).layout;
    const next = reconcileWall(first, photos(40), {
      width: 1280,
      height: 720,
    });
    expect(next.replanned).toBe(true);
  });
});

describe("rowSpeed y rowDirection", () => {
  it("cada fila va a su velocidad, proporcional al alto de fila", () => {
    const speeds = [0, 1, 2].map((i) => rowSpeed(i, 300));
    expect(new Set(speeds).size).toBe(3);
    expect(rowSpeed(0, 600)).toBeCloseTo(2 * rowSpeed(0, 300));
  });

  it("los sentidos se alternan", () => {
    expect([0, 1, 2].map(rowDirection)).toEqual(["left", "right", "left"]);
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
