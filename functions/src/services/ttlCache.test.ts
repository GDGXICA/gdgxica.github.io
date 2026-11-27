import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./ttlCache";

describe("TtlCache", () => {
  it("caches values until ttl expires and supports invalidation", async () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, () => now);
    const loader = vi.fn(async () => `v-${now}`);

    expect(await cache.getOrLoad("k", loader)).toBe("v-1000");
    now = 1200;
    expect(await cache.getOrLoad("k", loader)).toBe("v-1000");
    expect(loader).toHaveBeenCalledTimes(1);

    now = 1500;
    expect(await cache.getOrLoad("k", loader)).toBe("v-1500");
    expect(loader).toHaveBeenCalledTimes(2);

    cache.invalidate("k");
    now = 1600;
    expect(await cache.getOrLoad("k", loader)).toBe("v-1600");
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("deduplicates concurrent inflight loads for the same key", async () => {
    const cache = new TtlCache<number>(1000);
    let resolveLoad!: (value: number) => void;
    const loader = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveLoad = resolve;
        })
    );

    const p1 = cache.getOrLoad("hot", loader);
    const p2 = cache.getOrLoad("hot", loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoad(42);
    expect(await Promise.all([p1, p2])).toEqual([42, 42]);
  });

  it("respects shouldCache predicate", async () => {
    const cache = new TtlCache<boolean>(1000);
    const loader = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    expect(
      await cache.getOrLoad("member", loader, (value) => value === true)
    ).toBe(false);
    expect(
      await cache.getOrLoad("member", loader, (value) => value === true)
    ).toBe(true);
    expect(
      await cache.getOrLoad("member", loader, (value) => value === true)
    ).toBe(true);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
