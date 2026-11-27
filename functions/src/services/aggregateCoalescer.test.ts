import { afterEach, describe, expect, it, vi } from "vitest";
import { AggregateCoalescer } from "./aggregateCoalescer";

afterEach(() => {
  vi.useRealTimers();
});

describe("AggregateCoalescer", () => {
  it("coalesces bursts for the same key into a single flush", async () => {
    vi.useFakeTimers();
    const coalescer = new AggregateCoalescer(500);
    const flush = vi.fn(async () => undefined);

    const p1 = coalescer.schedule("evt/poll-1", flush);
    const p2 = coalescer.schedule("evt/poll-1", flush);
    const p3 = coalescer.schedule("evt/poll-1", flush);

    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([p1, p2, p3]);

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("schedules a trailing flush when a new event arrives after a flush starts", async () => {
    vi.useFakeTimers();
    const coalescer = new AggregateCoalescer(200);
    const flush = vi.fn(async () => undefined);

    const p1 = coalescer.schedule("evt/poll-1", flush);
    await vi.advanceTimersByTimeAsync(200);
    await p1;

    const p2 = coalescer.schedule("evt/poll-1", flush);
    await vi.advanceTimersByTimeAsync(200);
    await p2;

    expect(flush).toHaveBeenCalledTimes(2);
  });
});
