import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  nowMs: 15000,
  audit: vi.fn(async () => undefined),
}));

function ref(path: string) {
  return {
    path,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${path}/${name}/${id}`),
    }),
  };
}

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
  Timestamp: { now: () => ({ toMillis: () => mocks.nowMs }) },
}));
vi.mock("firebase-functions/v2/tasks", () => ({
  onTaskDispatched: (_options: unknown, handler: unknown) => handler,
}));
vi.mock("../utils/audit", () => ({ writeAuditLog: mocks.audit }));

import { answer, scoreQuizAnswer } from "./minigameQuiz";

const base = "events/devfest/minigames/quiz-1";
function seed() {
  mocks.data.set(base, {
    type: "quiz",
    state: "live",
    currentQuestionIndex: 0,
    currentQuestionStartedAt: { toMillis: () => 0 },
    config: {
      questions: [
        {
          id: "q1",
          options: [{ id: "a" }, { id: "b" }],
          points: 100,
          timeLimitSec: 30,
        },
      ],
    },
  });
  mocks.data.set(`${base}/participants/u1`, { alias: "Ana" });
  mocks.data.set(`${base}/secret/quiz`, { answers: { q1: "a" } });
}
function request(optionId: string): Request {
  return {
    params: { slug: "devfest", id: "quiz-1" },
    body: { questionId: "q1", optionId },
    user: { uid: "u1" },
  } as unknown as Request;
}
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
  mocks.nowMs = 15000;
  mocks.audit.mockClear();
  seed();
});

describe("scoreQuizAnswer", () => {
  it("awards more points for earlier correct answers", () => {
    expect(scoreQuizAnswer(100, 0, 30000)).toBe(100);
    expect(scoreQuizAnswer(100, 15000, 30000)).toBe(60);
    expect(scoreQuizAnswer(100, 30000, 30000)).toBe(20);
  });
  it("rejects answers after the deadline", () => {
    expect(scoreQuizAnswer(100, 30001, 30000)).toBe(0);
  });
});

describe("quiz answer API", () => {
  it("scores from the server key and clock, and writes only a private answer plus a receipt", async () => {
    const res = response();
    await answer(request("a"), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.data.get(`${base}/quiz_answers/u1_q1`)).toMatchObject({
      isCorrect: true,
      pointsEarned: 60,
      elapsedMs: 15000,
    });
    expect(mocks.data.get(`${base}/quiz_receipts/u1_q1`)).toMatchObject({
      uid: "u1",
      optionId: "a",
    });
    expect(mocks.data.get(`${base}/participants/u1`)).toEqual({ alias: "Ana" });
    expect(res.body).toEqual({
      success: true,
      data: { questionId: "q1", optionId: "a" },
    });
  });

  it("prevents a second answer and awards no points for a wrong option", async () => {
    await answer(request("b"), response());
    expect(mocks.data.get(`${base}/quiz_answers/u1_q1`)).toMatchObject({
      isCorrect: false,
      pointsEarned: 0,
    });
    const retry = response();
    await answer(request("a"), retry);
    expect(retry.statusCode).toBe(409);
    expect(mocks.data.get(`${base}/quiz_answers/u1_q1`)).toMatchObject({
      optionId: "b",
    });
  });

  it("rejects responses received at the deadline", async () => {
    mocks.nowMs = 30000;
    const res = response();
    await answer(request("a"), res);
    expect(res.statusCode).toBe(400);
    expect(mocks.data.has(`${base}/quiz_answers/u1_q1`)).toBe(false);
  });
});
