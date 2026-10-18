import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  audit: vi.fn(async () => undefined),
}));
const ref = (path: string) => ({
  path,
  collection: (name: string) => ({
    doc: (id: string) => ref(`${path}/${name}/${id}`),
  }),
});
vi.mock("firebase-admin", () => ({
  firestore: () => ({
    doc: (path: string) => ref(path),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        get: async (document: { path: string }) => ({
          exists: mocks.data.has(document.path),
          data: () => mocks.data.get(document.path),
        }),
        create: (document: { path: string }, data: Record<string, unknown>) =>
          mocks.data.set(document.path, data),
      }),
  }),
}));
vi.mock("firebase-admin/firestore", () => ({
  Timestamp: { now: () => "SERVER_TIME" },
}));
vi.mock("../utils/audit", () => ({ writeAuditLog: mocks.audit }));

import { answer } from "./minigamePoll";

const base = "events/devfest/minigames/poll-1";
const request = (questionId: string, optionId: string) =>
  ({
    params: { slug: "devfest", id: "poll-1" },
    body: { questionId, optionId },
    user: { uid: "u1" },
  }) as unknown as Request;
function response() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as typeof res & Response;
}

beforeEach(() => {
  mocks.data.clear();
  mocks.audit.mockClear();
  mocks.data.set(base, {
    type: "poll",
    state: "live",
    currentQuestionIndex: 1,
    config: {
      questions: [
        { id: "q1", options: [{ id: "a" }] },
        { id: "q2", options: [{ id: "a" }, { id: "b" }] },
      ],
    },
  });
  mocks.data.set(`${base}/participants/u1`, { uid: "u1" });
});

describe("poll answer API", () => {
  it("accepts one valid answer on the active question", async () => {
    const res = response();
    await answer(request("q2", "b"), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.data.get(`${base}/responses/u1_q2`)).toEqual({
      uid: "u1",
      questionId: "q2",
      optionId: "b",
      answeredAt: "SERVER_TIME",
    });
    const duplicate = response();
    await answer(request("q2", "a"), duplicate);
    expect(duplicate.statusCode).toBe(409);
  });

  it("rejects old questions and nonexistent options", async () => {
    const old = response();
    await answer(request("q1", "a"), old);
    expect(old.statusCode).toBe(400);
    const invalid = response();
    await answer(request("q2", "invented"), invalid);
    expect(invalid.statusCode).toBe(400);
    expect(
      [...mocks.data.keys()].filter((key) => key.includes("/responses/"))
    ).toHaveLength(0);
  });

  it("keeps single-question legacy polls playable without an index", async () => {
    mocks.data.set(base, {
      type: "poll",
      state: "live",
      config: {
        question: "¿Qué tema prefieres?",
        options: [{ id: "a" }, { id: "b" }],
      },
    });
    const res = response();
    await answer(request("main", "b"), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.data.get(`${base}/responses/u1_main`)).toMatchObject({
      optionId: "b",
    });
  });
});
