import { describe, expect, it } from "vitest";
import {
  MAX_TILES,
  peekNext,
  reconcileTiles,
  rotateTiles,
  tileCapacity,
  type Rotation,
} from "../wall";

describe("tileCapacity", () => {
  it("no pide más baldosas que fotos hay", () => {
    expect(tileCapacity(0)).toBe(0);
    expect(tileCapacity(3)).toBe(3);
  });

  it("se queda en el tope aunque haya muchas", () => {
    expect(tileCapacity(500)).toBe(MAX_TILES);
  });
});

describe("reconcileTiles", () => {
  it("llena la pared desde cero con lo más reciente primero", () => {
    expect(reconcileTiles([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("nunca repite una foto", () => {
    const tiles = reconcileTiles([], ["a", "b", "c"]);
    expect(new Set(tiles).size).toBe(tiles.length);
  });

  it("conserva las que ya estaban puestas, sin barajar la pared", () => {
    expect(reconcileTiles(["a", "b"], ["a", "b", "c", "d"])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("saca inmediatamente una foto que ya no está aprobada", () => {
    expect(reconcileTiles(["a", "b", "c"], ["a", "c"])).not.toContain("b");
  });

  it("al sacar una, rellena su hueco con otra que no estuviera puesta", () => {
    const next = reconcileTiles(["a", "b", "c"], ["a", "c", "d"]);
    expect(next).toContain("d");
    expect(next).not.toContain("b");
    expect(next).toHaveLength(3);
  });

  it("con el mural vacío no deja nada en la pared", () => {
    expect(reconcileTiles(["a", "b"], [])).toEqual([]);
  });

  it("nunca pasa del tope de baldosas", () => {
    const pool = Array.from({ length: 50 }, (_, i) => `p${i}`);
    expect(reconcileTiles([], pool)).toHaveLength(MAX_TILES);
  });
});

describe("rotateTiles", () => {
  it("cambia UNA sola baldosa por giro", () => {
    const before = { tiles: ["a", "b", "c"], cursor: 0, queue: [] };
    const after = rotateTiles(before, ["a", "b", "c", "d"]);

    const changed = after.tiles.filter((id, i) => id !== before.tiles[i]);
    expect(changed).toHaveLength(1);
  });

  it("avanza el cursor y da la vuelta", () => {
    let state: Rotation = { tiles: ["a", "b"], cursor: 0, queue: [] };
    state = rotateTiles(state, ["a", "b", "c", "d"]);
    expect(state.cursor).toBe(1);
    state = rotateTiles(state, ["a", "b", "c", "d"]);
    expect(state.cursor).toBe(0);
  });

  it("mete primero lo recién aprobado, saltándose la cola", () => {
    const state = { tiles: ["a", "b", "c"], cursor: 0, queue: [] };
    const after = rotateTiles(
      state,
      ["a", "b", "c", "vieja", "recien"],
      ["recien"]
    );
    expect(after.tiles).toContain("recien");
    expect(after.tiles).not.toContain("vieja");
  });

  it("ignora una prioridad que ya no está aprobada", () => {
    const state = { tiles: ["a", "b"], cursor: 0, queue: [] };
    const after = rotateTiles(state, ["a", "b", "c"], ["retirada"]);
    expect(after.tiles).toContain("c");
    expect(after.tiles).not.toContain("retirada");
  });

  it("no repite una foto que ya está en la pared", () => {
    const state = { tiles: ["a", "b"], cursor: 0, queue: [] };
    const after = rotateTiles(state, ["a", "b", "c"]);
    expect(new Set(after.tiles).size).toBe(after.tiles.length);
  });

  it("no toca nada si no hay ninguna foto nueva que enseñar", () => {
    const state = { tiles: ["a", "b", "c"], cursor: 1, queue: [] };
    expect(rotateTiles(state, ["a", "b", "c"])).toBe(state);
  });

  it("no hace nada con la pared vacía", () => {
    const state = { tiles: [], cursor: 0, queue: [] };
    expect(rotateTiles(state, ["a"])).toBe(state);
  });
});

describe("el ciclo completo", () => {
  it("una foto retirada no vuelve a la pared en el giro siguiente", () => {
    let state: Rotation = {
      tiles: reconcileTiles([], ["a", "b", "c"]),
      cursor: 0,
      queue: [],
    };
    const pool = ["a", "c"];

    state = { ...state, tiles: reconcileTiles(state.tiles, pool) };
    expect(state.tiles).not.toContain("b");

    for (let i = 0; i < 5; i++) {
      state = rotateTiles(state, pool);
      expect(state.tiles).not.toContain("b");
    }
  });

  it("con más fotos que baldosas acaba enseñándolas todas", () => {
    const pool = Array.from({ length: MAX_TILES + 4 }, (_, i) => `p${i}`);
    let state: Rotation = {
      tiles: reconcileTiles([], pool),
      cursor: 0,
      queue: [],
    };

    const seen = new Set(state.tiles);
    for (let i = 0; i < MAX_TILES * 3; i++) {
      state = rotateTiles(state, pool);
      for (const id of state.tiles) seen.add(id);
    }

    expect(seen.size).toBe(pool.length);
  });
});

describe("peekNext", () => {
  it("anuncia EXACTAMENTE la que va a entrar en el siguiente giro", () => {
    const pool = ["a", "b", "c", "d", "e"];
    let state: Rotation = { tiles: ["a", "b", "c"], cursor: 0, queue: [] };

    for (let i = 0; i < 6; i++) {
      const announced = peekNext(state, pool);
      const after = rotateTiles(state, pool);
      if (announced === null) {
        expect(after).toBe(state);
      } else {
        expect(after.tiles).toContain(announced);
        expect(state.tiles).not.toContain(announced);
      }
      state = after;
    }
  });

  it("respeta la prioridad de lo recién aprobado", () => {
    const state: Rotation = { tiles: ["a", "b"], cursor: 0, queue: [] };
    expect(peekNext(state, ["a", "b", "vieja", "recien"], ["recien"])).toBe(
      "recien"
    );
  });

  it("devuelve null cuando no hay nada nuevo que enseñar", () => {
    const state: Rotation = { tiles: ["a", "b"], cursor: 0, queue: [] };
    expect(peekNext(state, ["a", "b"])).toBeNull();
  });

  it("devuelve null con la pared vacía", () => {
    expect(peekNext({ tiles: [], cursor: 0, queue: [] }, ["a"])).toBeNull();
  });

  it("no altera el estado que recibe", () => {
    const state: Rotation = { tiles: ["a"], cursor: 0, queue: ["b"] };
    const copy = {
      tiles: [...state.tiles],
      cursor: 0,
      queue: [...state.queue],
    };
    peekNext(state, ["a", "b", "c"]);
    expect(state).toEqual(copy);
  });
});
