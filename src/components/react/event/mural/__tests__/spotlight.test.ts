import { describe, expect, it } from "vitest";
import {
  EMPTY_SPOTLIGHT,
  advance,
  detectArrivals,
  enqueue,
  prune,
  spotlightDuration,
} from "../spotlight";

describe("detectArrivals", () => {
  it("no destaca nada de lo que ya se había visto", () => {
    expect(detectArrivals(new Set(["a", "b"]), ["b", "a"])).toEqual([]);
  });

  it("devuelve las nuevas en orden cronológico", () => {
    expect(detectArrivals(new Set(["a"]), ["d", "c", "b", "a"])).toEqual([
      "b",
      "c",
      "d",
    ]);
  });
});

describe("enqueue", () => {
  it("la primera en llegar pasa directo a la pantalla", () => {
    const { state } = enqueue(EMPTY_SPOTLIGHT, ["a"]);
    expect(state).toEqual({ current: "a", queue: [] });
  });

  it("las demás esperan en orden", () => {
    const { state } = enqueue(EMPTY_SPOTLIGHT, ["a", "b", "c"]);
    expect(state).toEqual({ current: "a", queue: ["b", "c"] });
  });

  it("con la cola llena, las que sobran van directo a las cintas", () => {
    const { state, overflow } = enqueue(
      EMPTY_SPOTLIGHT,
      ["a", "b", "c", "d", "e", "f", "g", "h"],
      5
    );
    expect(state.current).toBe("a");
    expect(state.queue).toEqual(["b", "c", "d", "e", "f"]);
    expect(overflow).toEqual(["g", "h"]);
  });

  it("no encola dos veces la misma foto", () => {
    const first = enqueue(EMPTY_SPOTLIGHT, ["a", "b"]).state;
    expect(enqueue(first, ["b", "c"]).state.queue).toEqual(["b", "c"]);
  });
});

describe("advance", () => {
  it("devuelve la foto que terminó y pasa a la siguiente", () => {
    const { state, finished } = advance({ current: "a", queue: ["b"] });
    expect(finished).toBe("a");
    expect(state).toEqual({ current: "b", queue: [] });
  });

  it("sin cola, deja la pantalla libre", () => {
    expect(advance({ current: "a", queue: [] }).state).toEqual(EMPTY_SPOTLIGHT);
  });
});

describe("spotlightDuration", () => {
  it("dura más si nadie espera y menos si hay cola", () => {
    expect(spotlightDuration({ current: "a", queue: [] })).toBe(6000);
    expect(spotlightDuration({ current: "a", queue: ["b"] })).toBe(3500);
  });
});

describe("prune", () => {
  it("si retiran la foto destacada, se corta y entra la siguiente", () => {
    expect(prune({ current: "a", queue: ["b"] }, new Set(["b"]))).toEqual({
      current: "b",
      queue: [],
    });
  });

  it("si retiran una que esperaba, sale de la cola", () => {
    expect(
      prune({ current: "a", queue: ["b", "c"] }, new Set(["a", "c"]))
    ).toEqual({ current: "a", queue: ["c"] });
  });

  it("devuelve el mismo estado si no cambia nada", () => {
    const state = { current: "a", queue: ["b"] };
    expect(prune(state, new Set(["a", "b"]))).toBe(state);
  });
});
