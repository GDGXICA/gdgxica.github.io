import { vi } from "vitest";

// A recording 2D context.
//
// jsdom implements no canvas rasterizer and the repo ships no polyfill, so
// these tests assert what drawCredential ASKS the context to do — the call
// sequence and the computed coordinates — rather than the pixels that come
// out. That is the level worth pinning: the layout math is ours, the
// rasterizer is the browser's.

export interface RecordedCall {
  method: string;
  args: unknown[];
  /** ctx.fillStyle at the moment of the call. */
  fillStyle: string;
  /** ctx.strokeStyle at the moment of the call. */
  strokeStyle: string;
  /** ctx.font at the moment of the call. */
  font: string;
}

export interface MockContext {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
  /** Every call to the given method, in order. */
  callsTo(method: string): RecordedCall[];
  /** Ordered list of method names, for sequence assertions. */
  sequence(): string[];
}

const RECORDED_METHODS = [
  "save",
  "restore",
  "beginPath",
  "closePath",
  "clip",
  "arc",
  "fill",
  "stroke",
  "fillRect",
  "fillText",
  "strokeText",
  "drawImage",
  "scale",
  "setTransform",
  "translate",
  "rotate",
] as const;

/**
 * Approximates text width so fitText's ladder is exercised for real.
 *
 * Proportional to the font size parsed out of ctx.font, so a longer name
 * genuinely measures wider and the size-stepping and ellipsis branches are
 * both reachable from a test.
 */
const AVERAGE_GLYPH_RATIO = 0.55;

export function createMockContext(): MockContext {
  const calls: RecordedCall[] = [];

  const state = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    font: "10px sans-serif",
    lineWidth: 1,
    lineCap: "butt",
    textAlign: "start",
    textBaseline: "alphabetic",
  };

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({
        method,
        args,
        fillStyle: state.fillStyle,
        strokeStyle: state.strokeStyle,
        font: state.font,
      });
    });

  const target: Record<string, unknown> = {
    measureText: vi.fn((text: string) => {
      const match = /(\d+(?:\.\d+)?)px/.exec(state.font);
      const size = match ? Number(match[1]) : 10;
      return { width: text.length * size * AVERAGE_GLYPH_RATIO };
    }),
  };

  for (const method of RECORDED_METHODS) target[method] = record(method);

  // Proxy so property writes (fillStyle, font, ...) are visible to record()
  // at the moment each drawing call happens.
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in state) return state[prop as keyof typeof state];
      return obj[prop];
    },
    set(obj, prop: string, value) {
      if (prop in state) {
        (state as Record<string, unknown>)[prop] = value;
        return true;
      }
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    callsTo: (method: string) => calls.filter((c) => c.method === method),
    sequence: () => calls.map((c) => c.method),
  };
}

/** Stand-in for a decoded image with an intrinsic size. */
export function fakeImage(width: number, height: number): CanvasImageSource {
  return { naturalWidth: width, naturalHeight: height } as CanvasImageSource;
}
