import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
}));
const base = "events/devfest/minigames/quiz-1";

function snapshot(path: string) {
  return {
    id: path.split("/").at(-1),
    ref: ref(path),
    exists: mocks.data.has(path),
    data: () => mocks.data.get(path),
  };
}
function documents(prefix: string) {
  return [...mocks.data.keys()]
    .filter(
      (path) =>
        path.startsWith(`${prefix}/`) &&
        path.slice(prefix.length + 1).split("/").length === 1
    )
    .map(snapshot);
}
function ref(path: string) {
  return {
    path,
    get: async () => snapshot(path),
    set: async (
      data: Record<string, unknown>,
      options?: { merge?: boolean }
    ) => {
      mocks.data.set(
        path,
        options?.merge ? { ...mocks.data.get(path), ...data } : data
      );
    },
    collection: (name: string) => collection(`${path}/${name}`),
  };
}
function collection(path: string) {
  return {
    doc: (id: string) => ref(`${path}/${id}`),
    get: async () => ({ docs: documents(path) }),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({
        docs: documents(path).filter((doc) => doc.data()?.[field] === value),
      }),
    }),
  };
}
function update(path: string, changes: Record<string, unknown>) {
  const old = mocks.data.get(path) ?? {};
  const next = { ...old };
  for (const [key, value] of Object.entries(changes)) {
    const op = value as { op?: string; value?: unknown };
    if (op?.op === "increment")
      next[key] = Number(next[key] ?? 0) + Number(op.value);
    else if (op?.op === "arrayUnion")
      next[key] = [...new Set([...((next[key] as unknown[]) ?? []), op.value])];
    else next[key] = value;
  }
  mocks.data.set(path, next);
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    doc: ref,
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        get: async (document: { path: string }) => snapshot(document.path),
        update: (
          document: { path: string },
          changes: Record<string, unknown>
        ) => update(document.path, changes),
      }),
  }),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (value: number) => ({ op: "increment", value }),
    arrayUnion: (value: string) => ({ op: "arrayUnion", value }),
    serverTimestamp: () => "SERVER_TIME",
  },
}));
vi.mock("firebase-functions/v2/tasks", () => ({
  onTaskDispatched: (_options: unknown, handler: unknown) => handler,
}));

import { finishQuestion } from "./minigameQuiz";

const payload = {
  slug: "devfest",
  id: "quiz-1",
  questionId: "q1",
  startedAtMillis: 0,
};
beforeEach(() => {
  mocks.data.clear();
  mocks.data.set(base, {
    type: "quiz",
    config: { questions: [{ id: "q1", timeLimitSec: 30 }] },
  });
  mocks.data.set(`${base}/quiz_rounds/q1`, { startedAtMillis: 0 });
  mocks.data.set(`${base}/secret/quiz`, { answers: { q1: "a" } });
  mocks.data.set(`${base}/participants/u1`, { alias: "Ana", quizScore: 0 });
  mocks.data.set(`${base}/quiz_answers/u1_q1`, {
    uid: "u1",
    questionId: "q1",
    optionId: "a",
    isCorrect: true,
    pointsEarned: 60,
    elapsedMs: 15000,
  });
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("finishQuestion", () => {
  it("does not reveal answers before the deadline", async () => {
    vi.setSystemTime(new Date(29000));
    await expect(finishQuestion(payload)).rejects.toThrow("deadline");
    expect(mocks.data.has(`${base}/aggregates/current`)).toBe(false);
  });

  it("publishes results after the deadline and never scores twice on retry", async () => {
    vi.setSystemTime(new Date(32000));
    await finishQuestion(payload);
    expect(mocks.data.get(`${base}/participants/u1`)).toMatchObject({
      quizScore: 60,
      quizElapsedMs: 15000,
      lastQuizPoints: 60,
    });
    expect(mocks.data.get(`${base}/aggregates/current`)).toMatchObject({
      revealedAnswers: { q1: "a" },
      optionCounts: { "q1:a": 1 },
      leaderboard: [{ uid: "u1", alias: "Ana", score: 60, elapsedMs: 15000 }],
    });
    await finishQuestion(payload);
    expect(mocks.data.get(`${base}/participants/u1`)).toMatchObject({
      quizScore: 60,
    });
  });
});
