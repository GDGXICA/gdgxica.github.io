interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  async getOrLoad(
    key: string,
    loader: () => Promise<V>,
    shouldCache: (value: V) => boolean = () => true
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const gen = this.generations.get(key) ?? 0;
    const promise = loader()
      .then((value) => {
        if ((this.generations.get(key) ?? 0) === gen && shouldCache(value)) {
          this.set(key, value);
        }
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) {
          this.inflight.delete(key);
        }
      });

    this.inflight.set(key, promise);
    return promise;
  }

  reloadIfStale(
    key: string,
    staleValue: V,
    loader: () => Promise<V>,
    shouldCache: (value: V) => boolean = () => true
  ): Promise<V> {
    const entry = this.entries.get(key);
    if (entry && Object.is(entry.value, staleValue)) {
      this.invalidate(key);
    }
    return this.getOrLoad(key, loader, shouldCache);
  }

  invalidate(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    this.entries.delete(key);
    this.inflight.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.generations.clear();
  }
}
