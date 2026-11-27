export class AggregateCoalescer {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly delayMs = 800) {}

  schedule(key: string, flush: () => Promise<void>): Promise<void> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.timers.delete(key);
        this.pending.delete(key);
        flush().then(resolve, reject);
      }, this.delayMs);
      this.timers.set(key, timer);
    });

    this.pending.set(key, promise);
    return promise;
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pending.clear();
  }
}
