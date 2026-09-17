import { afterEach, describe, expect, it, vi } from "vitest";
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

function stubCanvas({
  bitmapWidth = 4000,
  bitmapHeight = 3000,
  outBytes = 10,
} = {}) {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "",

    fillRect: vi.fn(() => calls.push("fillRect")),
    drawImage: vi.fn(() => calls.push("drawImage")),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(
      (mime: string) =>
        `data:${mime};base64,${Buffer.alloc(outBytes).toString("base64")}`
    ),
  };

  const createImageBitmap = vi.fn(async () => ({
    width: bitmapWidth,
    height: bitmapHeight,
    close: vi.fn(),
  }));
  vi.stubGlobal("createImageBitmap", createImageBitmap);

  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas"
      ? canvas
      : realCreate(tag)) as unknown as typeof document.createElement);

  return { createImageBitmap, canvas, ctx, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareImage", () => {
  it("rechaza un formato que la API no acepta", async () => {
    const file = new File(["x"], "animado.gif", { type: "image/gif" });
    expect(await prepareImage(file)).toEqual({
      error: "Solo se admiten imágenes JPG, PNG o WebP",
    });
  });

  it("sube tal cual una imagen que ya cabe", async () => {
    const file = new File(["contenido-pequeño"], "logo.png", {
      type: "image/png",
    });
    const result = await prepareImage(file);
    expect("dataUrl" in result).toBe(true);
    if ("dataUrl" in result) {
      expect(result.dataUrl).toContain("data:image/png");

      expect(result.width).toBeNull();
      expect(result.height).toBeNull();
    }
  });

  describe("forceReencode", () => {
    it("recodifica aunque el archivo YA quepa", async () => {
      const { createImageBitmap } = stubCanvas();
      const file = new File(["diminuto"], "foto.jpg", { type: "image/jpeg" });
      expect(file.size).toBeLessThan(1000);

      const result = await prepareImage(file, {
        forceReencode: true,
        maxBytes: 300 * 1024,
      });

      expect(createImageBitmap).toHaveBeenCalled();
      expect("dataUrl" in result).toBe(true);
    });

    it("sin la opción, el MISMO archivo toma el atajo y no se recodifica", async () => {
      const { createImageBitmap } = stubCanvas();
      const file = new File(["diminuto"], "foto.jpg", { type: "image/jpeg" });

      await prepareImage(file, { maxBytes: 300 * 1024 });

      expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it("pide la orientación del EXIF antes de tirarlo", async () => {
      const { createImageBitmap } = stubCanvas();
      const file = new File(["x"], "vertical.jpg", { type: "image/jpeg" });

      await prepareImage(file, { forceReencode: true });

      expect(createImageBitmap).toHaveBeenCalledWith(file, {
        imageOrientation: "from-image",
      });
    });

    it("la salida siempre es JPEG, entre cualquier formato de entrada", async () => {
      const { canvas } = stubCanvas();
      const file = new File(["x"], "con-alpha.png", { type: "image/png" });

      const result = await prepareImage(file, { forceReencode: true });

      expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
      if ("dataUrl" in result) expect(result.dataUrl).toContain("image/jpeg");
    });

    it("rellena de blanco ANTES de dibujar, para que lo transparente no salga negro", async () => {
      const { ctx, calls } = stubCanvas();
      const file = new File(["x"], "con-alpha.png", { type: "image/png" });

      await prepareImage(file, { forceReencode: true });

      expect(ctx.fillStyle).toBe("#ffffff");
      expect(calls.indexOf("fillRect")).toBeLessThan(
        calls.indexOf("drawImage")
      );
    });

    it("devuelve las dimensiones ya encajadas en maxDimension", async () => {
      const { canvas } = stubCanvas({ bitmapWidth: 4000, bitmapHeight: 3000 });
      const file = new File(["x"], "grande.jpg", { type: "image/jpeg" });

      const result = await prepareImage(file, {
        forceReencode: true,
        maxDimension: 1600,
      });

      expect(result).toMatchObject({ width: 1600, height: 1200 });
      expect(canvas.width).toBe(1600);
      expect(canvas.height).toBe(1200);
    });

    it("baja de calidad hasta entrar en el tope, y se rinde con un error útil", async () => {
      const { canvas } = stubCanvas({ outBytes: 5000 });
      const file = new File(["x"], "pesada.jpg", { type: "image/jpeg" });

      const result = await prepareImage(file, {
        forceReencode: true,
        maxBytes: 100,
      });

      expect(canvas.toDataURL).toHaveBeenCalledTimes(3);
      expect(result).toEqual({
        error:
          "La imagen sigue siendo demasiado pesada. Recórtala o redúcela antes de subirla.",
      });
    });

    it("degrada con un error legible si la imagen no se puede decodificar", async () => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockRejectedValue(new Error("corrupta"))
      );
      const file = new File(["x"], "rota.jpg", { type: "image/jpeg" });

      expect(await prepareImage(file, { forceReencode: true })).toEqual({
        error: "No se pudo leer la imagen",
      });
    });
  });
});

describe("el camino de los posts", () => {
  /**
   * `imageOrientation: "from-image"` se añadió para el mural, pero alcanza
   * también a los posts cuando el archivo supera el tope y hay que
   * recodificarlo. Es una mejora —antes esa recodificación perdía la etiqueta
   * de orientación y una foto vertical salía tumbada— y se fija aquí para que
   * sea una decisión y no un efecto colateral silencioso.
   */
  it("una imagen grande de post se recodifica respetando la orientación", async () => {
    const { createImageBitmap } = stubCanvas();
    const big = new File([new Uint8Array(600 * 1024)], "grande.jpg", {
      type: "image/jpeg",
    });

    await prepareImage(big);

    expect(createImageBitmap).toHaveBeenCalledWith(big, {
      imageOrientation: "from-image",
    });
  });

  it("una imagen pequeña de post sigue subiéndose intacta", async () => {
    const { createImageBitmap } = stubCanvas();
    const small = new File(["diminuto"], "logo.png", { type: "image/png" });

    const result = await prepareImage(small);

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect("dataUrl" in result).toBe(true);
  });
});
