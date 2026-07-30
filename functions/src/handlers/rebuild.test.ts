import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const written: Record<string, unknown>[] = [];
let dispatches = 0;
let dispatchFails = false;

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions", () => ({ logger: loggerMock }));

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: () => ({
      doc: () => ({ __path: "audit_log/gen" }),
      add: async (data: Record<string, unknown>) => {
        written.push(data);
        return { id: "gen" };
      },
    }),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
}));

vi.mock("../config", () => ({
  GITHUB_TOKEN: { value: () => "token" },
}));

vi.mock("../services/github", () => ({
  GitHubService: class {
    async triggerRebuild() {
      dispatches += 1;
      if (dispatchFails) throw new Error("github down");
    }
  },
}));

interface ResMock extends Response {
  __status: number | undefined;
  __body: { success?: boolean; message?: string } | undefined;
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

function buildReq(uid = "adm"): Request {
  return { user: { uid, role: "admin", scope: "*" } } as unknown as Request;
}

beforeEach(() => {
  written.length = 0;
  dispatches = 0;
  dispatchFails = false;
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
  vi.resetModules();
});

/** El debounce vive en un módulo con estado, así que se reimporta por test. */
async function freshHandler() {
  return (await import("./rebuild")).triggerRebuild;
}

describe("triggerRebuild", () => {
  it("audita el despacho real", async () => {
    const triggerRebuild = await freshHandler();
    const res = buildRes();
    await triggerRebuild(buildReq(), res);

    expect(dispatches).toBe(1);
    expect(res.__body?.success).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      action: "site.rebuild",
      performedBy: "adm",
      targetType: "site",
      outcome: "success",
    });
  });

  // El debounce devuelve 202 y NO despacha nada. Auditarlo como un rebuild más
  // haría que el registro contara publicaciones que nunca ocurrieron, y quien
  // lo lea después buscaría en el sitio un cambio que no está.
  it("la rama del debounce se registra como denied, no como éxito", async () => {
    const triggerRebuild = await freshHandler();
    await triggerRebuild(buildReq(), buildRes());

    const res = buildRes();
    await triggerRebuild(buildReq("otra-persona"), res);

    expect(dispatches).toBe(1);
    expect(res.__status).toBe(202);
    expect(written).toHaveLength(2);
    expect(written[1]).toMatchObject({
      action: "site.rebuild",
      performedBy: "otra-persona",
      outcome: "denied",
      details: { debounced: true },
    });
  });

  it("el 202 del debounce lleva retryAfter y queda en el registro", async () => {
    const triggerRebuild = await freshHandler();
    await triggerRebuild(buildReq(), buildRes());
    const res = buildRes();
    await triggerRebuild(buildReq(), res);

    expect(res.__body).toMatchObject({ message: "Rebuild already queued" });
    expect(written[1].details).toMatchObject({ debounced: true });
    expect(
      (written[1].details as { retryAfter?: number }).retryAfter
    ).toBeGreaterThan(0);
  });

  // Publicar el sitio público es la acción con más alcance del panel, así que un
  // fallo tiene que quedar registrado y no solo devolver 500.
  it("un fallo de GitHub se registra como failure", async () => {
    dispatchFails = true;
    const triggerRebuild = await freshHandler();
    const res = buildRes();
    await triggerRebuild(buildReq(), res);

    expect(res.__status).toBe(500);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      action: "site.rebuild",
      outcome: "failure",
    });
  });

  it("clasifica el rebuild como operación", async () => {
    const triggerRebuild = await freshHandler();
    await triggerRebuild(buildReq(), buildRes());
    expect(written[0]).toMatchObject({ category: "operations" });
  });
});
