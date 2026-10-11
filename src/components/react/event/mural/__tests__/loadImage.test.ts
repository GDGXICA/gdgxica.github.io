import { afterEach, describe, expect, it, vi } from "vitest";
import { loadImage } from "../loadImage";

afterEach(() => {
  vi.useRealTimers();
});

describe("loadImage", () => {
  it("se rinde si la imagen no responde a tiempo", async () => {
    vi.useFakeTimers();
    const result = loadImage("https://fotos.test/colgada.jpg", 1000);
    const settled = vi.fn();
    result.catch(settled);

    vi.advanceTimersByTime(999);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await expect(result).rejects.toThrow("Tardó demasiado");
  });
});
