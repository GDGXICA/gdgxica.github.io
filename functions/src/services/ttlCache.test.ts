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

  it("does not cache stale inflight result if invalidated before completion", async () => {
    const cache = new TtlCache<string>(1000);
    let resolveStale!: (value: string) => void;
    const staleLoader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveStale = resolve;
        })
    );
    const freshLoader = vi.fn(async () => "q3");

    const stalePromise = cache.getOrLoad("inst", staleLoader);
    cache.invalidate("inst");
    resolveStale("q2");

    expect(await stalePromise).toBe("q2");
    expect(await cache.getOrLoad("inst", freshLoader)).toBe("q3");
    expect(freshLoader).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent reloadIfStale calls into a single fresh load", async () => {
    const cache = new TtlCache<{ q: string }>(1000);
    const stale = { q: "q2" };
    const fresh = { q: "q3" };
    cache.set("inst", stale);

    let resolveFresh!: (value: { q: string }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ q: string }>((resolve) => {
          resolveFresh = resolve;
        })
    );

    const p1 = cache.reloadIfStale("inst", stale, loader);
    const p2 = cache.reloadIfStale("inst", stale, loader);
    const p3 = cache.reloadIfStale("inst", stale, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveFresh(fresh);
    expect(await Promise.all([p1, p2, p3])).toEqual([fresh, fresh, fresh]);
  });
});
