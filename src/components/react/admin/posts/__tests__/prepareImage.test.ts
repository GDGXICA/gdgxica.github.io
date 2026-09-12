import { describe, expect, it } from "vitest";
import {
  MAX_DIMENSION,
  decodedBytes,
  fitWithin,
  prepareImage,
} from "../prepareImage";

describe("fitWithin", () => {
  it("deja intacto lo que ya cabe", () => {
    expect(fitWithin(800, 600, MAX_DIMENSION)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("reduce por el lado más largo y conserva la proporción", () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1200, 4800, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it("nunca baja de un píxel", () => {
    expect(fitWithin(10000, 3, 100).height).toBe(1);
  });
});

describe("decodedBytes", () => {
  it("cuenta los bytes reales tras el base64", () => {
    const bytes = Buffer.from("hola mundo");
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    expect(decodedBytes(dataUrl)).toBe(bytes.length);
  });
});

describe("prepareImage", () => {
  it("rechaza un formato que la API no acepta", async () => {
    const file = new File(["x"], "animado.gif", { type: "image/gif" });
    expect(await prepareImage(file)).toEqual({
      error: "Solo se admiten imágenes JPG, PNG o WebP",
    });
  });

  // Recodificar un PNG pequeño solo le quitaría calidad —y la transparencia—
  // sin ganar nada.
  it("sube tal cual una imagen que ya cabe", async () => {
    const file = new File(["contenido-pequeño"], "logo.png", {
      type: "image/png",
    });
    const result = await prepareImage(file);
    expect("dataUrl" in result).toBe(true);
    if ("dataUrl" in result) expect(result.dataUrl).toContain("data:image/png");
  });
});
