import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Consultas construidas, para poder afirmar sobre lo que se pidió a Firestore. */
interface RecordedQuery {
  wheres: { field: string; op: string; value: unknown }[];
  orderBy: string | null;
  limit: number | null;
  startAfter: string | null;
}

let recorded: RecordedQuery;
let rows: { id: string; data: Record<string, unknown> }[] = [];
let cursorExists = true;

function queryStub(): Record<string, unknown> {
  const self = {
    where: (field: string, op: string, value: unknown) => {
      recorded.wheres.push({ field, op, value });
      return self;
    },
    orderBy: (field: string) => {
      recorded.orderBy = field;
      return self;
    },
    limit: (n: number) => {
      recorded.limit = n;
      return self;
    },
    startAfter: (doc: { id: string }) => {
      recorded.startAfter = doc.id;
      return self;
    },
    get: async () => ({
      docs: rows.map((r) => ({ id: r.id, data: () => r.data })),
    }),
  };
  return self as unknown as Record<string, unknown>;
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: () => ({
      ...queryStub(),
      doc: (id: string) => ({
        get: async () => ({ exists: cursorExists, id }),
      }),
    }),
  }),
}));

vi.mock("firebase-functions", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { listAudit } from "./audit";

interface ResMock extends Response {
  __status: number | undefined;
  __body:
    | {
        success?: boolean;
        error?: string;
        data?: { entries?: unknown[]; nextCursor?: string | null };
      }
    | undefined;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = {};
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: unknown) {
    this.__body = body as ResMock["__body"];
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

function buildReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function seed(n: number) {
  rows = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    data: { action: "event.create", performedBy: "u1" },
  }));
}

beforeEach(() => {
  recorded = { wheres: [], orderBy: null, limit: null, startAfter: null };
  cursorExists = true;
  seed(3);
});

describe("orden y forma", () => {
  // El registro se lee como una cronología: cualquier otro orden lo vuelve
  // ilegible para lo que se usa.
  it("ordena por timestamp descendente", async () => {
    await listAudit(buildReq(), buildRes());
    expect(recorded.orderBy).toBe("timestamp");
  });

  it("devuelve las entradas con su id", async () => {
    const res = buildRes();
    await listAudit(buildReq(), res);
    expect(res.__body?.data?.entries).toHaveLength(3);
    expect(res.__body?.success).toBe(true);
  });
});

describe("filtros", () => {
  it.each([
    "action",
    "performedBy",
    "targetId",
    "category",
    "severity",
    "outcome",
    "context.ipPrefix",
  ])("admite el filtro %s", async (field) => {
    await listAudit(buildReq({ [field]: "x" }), buildRes());
    expect(recorded.wheres).toEqual([{ field, op: "==", value: "x" }]);
  });

  // Cada combinación exigiría su propio índice compuesto: permitir dos
  // multiplicaría los índices para comprar una comodidad que nadie pidió.
  it("rechaza dos filtros a la vez", async () => {
    const res = buildRes();
    await listAudit(
      buildReq({ action: "event.create", performedBy: "u1" }),
      res
    );
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toContain("at most one filter");
    expect(recorded.wheres).toEqual([]);
  });

  it("sin filtro no añade ningún where", async () => {
    await listAudit(buildReq(), buildRes());
    expect(recorded.wheres).toEqual([]);
  });

  it("ignora un filtro vacío", async () => {
    await listAudit(buildReq({ action: "" }), buildRes());
    expect(recorded.wheres).toEqual([]);
  });

  // Se resuelve con un `in` sobre el campo que ya tiene índice. Una desigualdad
  // `severity >= "warning"` obligaría a que el primer orderBy fuese `severity`,
  // y entonces el registro dejaría de estar ordenado por fecha.
  it("severity=notable se traduce a un `in`", async () => {
    await listAudit(buildReq({ severity: "notable" }), buildRes());
    expect(recorded.wheres).toEqual([
      { field: "severity", op: "in", value: ["warning", "critical"] },
    ]);
    expect(recorded.orderBy).toBe("timestamp");
  });

  it("una severidad concreta sigue siendo igualdad", async () => {
    await listAudit(buildReq({ severity: "critical" }), buildRes());
    expect(recorded.wheres).toEqual([
      { field: "severity", op: "==", value: "critical" },
    ]);
  });

  // El prefijo de red es lo único que se guarda; la dirección completa vive
  // solo en Cloud Logging.
  it("filtra por prefijo de red", async () => {
    await listAudit(
      buildReq({ "context.ipPrefix": "181.65.42.0/24" }),
      buildRes()
    );
    expect(recorded.wheres[0]).toMatchObject({
      field: "context.ipPrefix",
      value: "181.65.42.0/24",
    });
  });
});

describe("paginación", () => {
  it("por defecto pide 50 más uno", async () => {
    await listAudit(buildReq(), buildRes());
    expect(recorded.limit).toBe(51);
  });

  it("acota el límite a 200", async () => {
    await listAudit(buildReq({ limit: "5000" }), buildRes());
    expect(recorded.limit).toBe(201);
  });

  it("ignora un límite absurdo", async () => {
    await listAudit(buildReq({ limit: "-3" }), buildRes());
    expect(recorded.limit).toBe(51);
  });

  // Se pide uno de más para saber si hay página siguiente sin contar la
  // colección entera.
  it("no devuelve el de más y expone el cursor", async () => {
    seed(51);
    const res = buildRes();
    await listAudit(buildReq(), res);
    expect(res.__body?.data?.entries).toHaveLength(50);
    expect(res.__body?.data?.nextCursor).toBe("e49");
  });

  it("sin más páginas el cursor es null", async () => {
    seed(10);
    const res = buildRes();
    await listAudit(buildReq(), res);
    expect(res.__body?.data?.nextCursor).toBeNull();
  });

  // Cursor por documento y no por fecha: varias entradas pueden compartir
  // `timestamp` (una operación que escribe varias filas), y paginar por valor
  // se saltaría entradas o las repetiría.
  it("pagina con el documento del cursor", async () => {
    await listAudit(buildReq({ cursor: "e7" }), buildRes());
    expect(recorded.startAfter).toBe("e7");
  });

  it("rechaza un cursor inexistente", async () => {
    cursorExists = false;
    const res = buildRes();
    await listAudit(buildReq({ cursor: "fantasma" }), res);
    expect(res.__status).toBe(400);
    expect(res.__body?.error).toBe("Invalid cursor");
  });
});
