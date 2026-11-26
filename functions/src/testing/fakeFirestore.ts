// In-memory Firestore for handler and trigger tests.
//
// Covers what the certificate code uses: documents and subcollections,
// transactions (reads before writes, writes applied on commit), simple
// queries (==, !=, in, <, <=, >, >=, orderBy, limit, select), getAll,
// serverTimestamp and increment. Not a general emulator: anything else
// throws, so a test cannot pass by silently ignoring an operation.
//
// Test-only. Excluded from the build in tsconfig.json.

type Data = Record<string, unknown>;

export class FakeTimestamp {
  constructor(readonly ms: number) {}
  toMillis(): number {
    return this.ms;
  }
  toDate(): Date {
    return new Date(this.ms);
  }
  static fromMillis(ms: number): FakeTimestamp {
    return new FakeTimestamp(ms);
  }
  static fromDate(d: Date): FakeTimestamp {
    return new FakeTimestamp(d.getTime());
  }
  static now(): FakeTimestamp {
    return new FakeTimestamp(clock.now());
  }
}

const clock = { now: () => Date.now() };

/** Fixes "now" for serverTimestamp() and Timestamp.now(). */
export function setFakeNow(fn: () => number): void {
  clock.now = fn;
}

interface Sentinel {
  __fake: "serverTimestamp" | "increment";
  n?: number;
}

export const FakeFieldValue = {
  serverTimestamp: (): Sentinel => ({ __fake: "serverTimestamp" }),
  increment: (n: number): Sentinel => ({ __fake: "increment", n }),
};

function isSentinel(v: unknown): v is Sentinel {
  return typeof v === "object" && v !== null && "__fake" in v;
}

function resolve(value: unknown, previous: unknown): unknown {
  if (isSentinel(value)) {
    if (value.__fake === "serverTimestamp") return FakeTimestamp.now();
    return (typeof previous === "number" ? previous : 0) + (value.n ?? 0);
  }
  return value;
}

function comparable(v: unknown): unknown {
  return v instanceof FakeTimestamp ? v.ms : v;
}

function clone<T>(v: T): T {
  if (v instanceof FakeTimestamp) return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object") {
    const out: Data = {};
    for (const [k, val] of Object.entries(v as Data)) out[k] = clone(val);
    return out as T;
  }
  return v;
}

export class FakeSnapshot {
  constructor(
    readonly ref: FakeDocRef,
    private readonly value: Data | undefined
  ) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.value !== undefined;
  }
  data(): Data | undefined {
    return this.value === undefined ? undefined : clone(this.value);
  }
}

export class FakeFirestore {
  readonly docs = new Map<string, Data>();

  collection(path: string): FakeCollectionRef {
    return new FakeCollectionRef(this, path);
  }

  doc(path: string): FakeDocRef {
    const parts = path.split("/");
    return new FakeDocRef(this, parts.slice(0, -1).join("/"), parts.at(-1)!);
  }

  async getAll(...refs: FakeDocRef[]): Promise<FakeSnapshot[]> {
    return refs.map((r) => r.snapshot());
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }

  /** Raw document data, for assertions. */
  get(path: string): Data | undefined {
    const v = this.docs.get(path);
    return v === undefined ? undefined : clone(v);
  }

  /** Seeds a document, bypassing everything. */
  seed(path: string, data: Data): void {
    this.docs.set(path, clone(data));
  }

  write(path: string, data: Data, mode: "set" | "merge" | "update"): void {
    const previous = this.docs.get(path);
    if (mode === "update" && previous === undefined) {
      throw new Error(`NOT_FOUND: ${path}`);
    }
    const fields = new Map<string, unknown>(
      mode === "set" ? [] : Object.entries(previous ?? {})
    );
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      fields.set(k, resolve(v, previous?.[k]));
    }
    this.docs.set(path, Object.fromEntries(fields));
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    private readonly collectionPath: string,
    readonly id: string
  ) {}
  get path(): string {
    return `${this.collectionPath}/${this.id}`;
  }
  get parent(): FakeCollectionRef {
    return new FakeCollectionRef(this.db, this.collectionPath);
  }
  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
  snapshot(): FakeSnapshot {
    return new FakeSnapshot(this, this.db.docs.get(this.path));
  }
  async get(): Promise<FakeSnapshot> {
    return this.snapshot();
  }
  async set(data: Data, opts?: { merge?: boolean }): Promise<void> {
    this.db.write(this.path, data, opts?.merge ? "merge" : "set");
  }
  async update(data: Data): Promise<void> {
    this.db.write(this.path, data, "update");
  }
  async delete(): Promise<void> {
    this.db.docs.delete(this.path);
  }
}

type Op = "==" | "!=" | "in" | "<" | "<=" | ">" | ">=";

class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    readonly path: string,
    private readonly filters: [string, Op, unknown][] = [],
    private readonly order: [string, "asc" | "desc"][] = [],
    private readonly max?: number
  ) {}

  where(field: string, op: Op, value: unknown): FakeQuery {
    if (!["==", "!=", "in", "<", "<=", ">", ">="].includes(op)) {
      throw new Error(`Fake Firestore: unsupported operator ${op}`);
    }
    return new FakeQuery(
      this.db,
      this.path,
      [...this.filters, [field, op, value]],
      this.order,
      this.max
    );
  }
  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(
      this.db,
      this.path,
      this.filters,
      [...this.order, [field, dir]],
      this.max
    );
  }
  limit(n: number): FakeQuery {
    return new FakeQuery(this.db, this.path, this.filters, this.order, n);
  }
  select(): FakeQuery {
    return this;
  }

  async get() {
    const prefix = `${this.path}/`;
    let rows = [...this.db.docs.entries()].filter(
      ([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/")
    );
    for (const [field, op, value] of this.filters) {
      rows = rows.filter(([, data]) => {
        const actual = comparable(data[field]);
        const expected = comparable(value);
        if (actual === undefined) return false;
        switch (op) {
          case "==":
            return actual === expected;
          case "!=":
            return actual !== expected;
          case "in":
            return (value as unknown[]).map(comparable).includes(actual);
          case "<":
            return actual !== null && (actual as number) < (expected as number);
          case "<=":
            return (
              actual !== null && (actual as number) <= (expected as number)
            );
          case ">":
            return actual !== null && (actual as number) > (expected as number);
          case ">=":
            return (
              actual !== null && (actual as number) >= (expected as number)
            );
        }
      });
    }
    for (const [field, dir] of [...this.order].reverse()) {
      rows.sort(([, a], [, b]) => {
        const x = comparable(a[field]) as number;
        const y = comparable(b[field]) as number;
        return dir === "asc" ? x - y : y - x;
      });
    }
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    const docs = rows.map(([p, data]) => {
      const id = p.slice(prefix.length);
      return new FakeSnapshot(new FakeDocRef(this.db, this.path, id), data);
    });
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

export class FakeCollectionRef extends FakeQuery {
  private autoId = 0;
  get id(): string {
    return this.path.split("/").at(-1)!;
  }
  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, this.path, id ?? `auto${++this.autoId}`);
  }
  async add(data: Data): Promise<FakeDocRef> {
    const ref = this.doc(`auto-${Math.random().toString(36).slice(2)}`);
    await ref.set(data);
    return ref;
  }
}

export class FakeTransaction {
  private readonly writes: (() => void)[] = [];
  constructor(private readonly db: FakeFirestore) {}

  private assertNoWrites() {
    if (this.writes.length > 0) {
      throw new Error(
        "Fake Firestore: transactions require all reads before writes"
      );
    }
  }
  async get(ref: FakeDocRef): Promise<FakeSnapshot> {
    this.assertNoWrites();
    return ref.snapshot();
  }
  async getAll(...refs: FakeDocRef[]): Promise<FakeSnapshot[]> {
    this.assertNoWrites();
    return refs.map((r) => r.snapshot());
  }
  set(ref: FakeDocRef, data: Data, opts?: { merge?: boolean }): this {
    this.writes.push(() =>
      this.db.write(ref.path, data, opts?.merge ? "merge" : "set")
    );
    return this;
  }
  update(ref: FakeDocRef, data: Data): this {
    this.writes.push(() => this.db.write(ref.path, data, "update"));
    return this;
  }
  delete(ref: FakeDocRef): this {
    this.writes.push(() => this.db.docs.delete(ref.path));
    return this;
  }
  commit(): void {
    for (const w of this.writes) w();
  }
}

/** The instance the mocked `admin.firestore()` returns. */
export let currentDb = new FakeFirestore();

export function resetFakeFirestore(): FakeFirestore {
  currentDb = new FakeFirestore();
  return currentDb;
}
