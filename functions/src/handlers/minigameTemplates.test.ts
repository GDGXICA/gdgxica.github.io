import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock firebase-admin BEFORE importing the handler so the handler captures
// the mocked admin. Each test wires the collection() return so we can spy
// on doc/get/add/set/delete calls.
const collectionMock = vi.fn();
const fieldValueServerTimestamp = "__SERVER_TS__";

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(() => ({ collection: collectionMock }), {
    FieldValue: {
      serverTimestamp: () => fieldValueServerTimestamp,
    },
  }),
}));

// Imported after the mock is set up.
import * as handler from "./minigameTemplates";
import type { AuthenticatedRequest } from "../middleware/auth";

interface ResMock extends Response {
  __status: number | undefined;
  __body: unknown;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = {};
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: unknown) {
    this.__body = body;
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

function buildReq(body: unknown, params: Record<string, string> = {}): Request {
  const req = {
    body,
    params,
    user: { uid: "admin-uid" },
  } as unknown as AuthenticatedRequest;
  return req as unknown as Request;
}

const samplePoll = {
  type: "poll" as const,
  title: "Sample poll",
  description: "",
  poll: {
    question: "What is RAG?",
    options: [
      { id: "a", label: "Retrieval Augmented Generation" },
      { id: "b", label: "Random Access Generator" },
    ],
  },
};

const sampleQuiz = {
  type: "quiz" as const,
  title: "Quiz Q1",
  description: "",
  quiz: {
    questions: [
      {
        id: "q1",
        prompt: "Multimodal model from Google?",
        options: [
          { id: "a", label: "Gemini" },
          { id: "b", label: "GPT-4" },
        ],
        correctOptionId: "a",
        timeLimitSec: 30,
        points: 100,
      },
    ],
  },
};

const sampleWordcloud = {
  type: "wordcloud" as const,
  title: "Hopes for AI",
  description: "",
  wordcloud: {
    prompt: "What do you hope to learn?",
    maxWordsPerUser: 3,
    maxLength: 60,
  },
};

const sampleBingo = {
  type: "bingo" as const,
  title: "Buzzword Bingo",
  description: "",
  bingo: {
    terms: Array.from({ length: 16 }, (_, i) => `term-${i + 1}`),
    cardSize: 4 as const,
    freeCenter: false,
  },
};

describe("minigameTemplates handler", () => {
  beforeEach(() => {
    collectionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns docs ordered by updatedAt desc", async () => {
      const docs = [
        { id: "t1", data: () => ({ ...samplePoll, version: 2 }) },
        { id: "t2", data: () => ({ ...sampleQuiz, version: 1 }) },
      ];
      const orderBy = vi.fn(() => ({ get: vi.fn(async () => ({ docs })) }));
      collectionMock.mockReturnValue({ orderBy });

      const req = buildReq({});
      const res = buildRes();
      await handler.list(req, res);

      expect(collectionMock).toHaveBeenCalledWith("minigame_templates");
      expect(orderBy).toHaveBeenCalledWith("updatedAt", "desc");
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: "t1", ...samplePoll, version: 2 },
          { id: "t2", ...sampleQuiz, version: 1 },
        ],
      });
    });
  });

  describe("create", () => {
    it.each([
      ["poll", samplePoll],
      ["quiz", sampleQuiz],
      ["wordcloud", sampleWordcloud],
      ["bingo", sampleBingo],
    ])("creates a %s template", async (_label, payload) => {
      const add = vi.fn(async () => ({ id: "new-id" }));
      const auditAdd = vi.fn(async () => undefined);
      collectionMock.mockImplementation((name: string) => {
        if (name === "minigame_templates") return { add };
        if (name === "audit_log") return { add: auditAdd };
        throw new Error("unexpected collection " + name);
      });

      const res = buildRes();
      await handler.create(buildReq(payload), res);

      expect(add).toHaveBeenCalledTimes(1);
      const stored = add.mock.calls[0][0] as Record<string, unknown>;
      expect(stored).toMatchObject({
        ...payload,
        createdBy: "admin-uid",
        version: 1,
      });
      expect(stored.createdAt).toBe(fieldValueServerTimestamp);
      expect(stored.updatedAt).toBe(fieldValueServerTimestamp);
      expect(res.__status).toBe(201);
      expect(res.__body).toEqual({ success: true, data: { id: "new-id" } });

      expect(auditAdd).toHaveBeenCalledTimes(1);
      const auditPayload = auditAdd.mock.calls[0][0] as Record<string, unknown>;
      expect(auditPayload).toMatchObject({
        action: "minigame_template.create",
        performedBy: "admin-uid",
        targetId: "new-id",
        targetType: "minigame_template",
        details: { type: payload.type, title: payload.title },
      });
    });

    it("returns 500 if firestore add throws", async () => {
      collectionMock.mockReturnValue({
        add: vi.fn(async () => {
          throw new Error("write failed");
        }),
      });
      const res = buildRes();
      await handler.create(buildReq(samplePoll), res);
      expect(res.__status).toBe(500);
      expect((res.__body as { success: boolean }).success).toBe(false);
    });
  });

  describe("update", () => {
    it("updates an existing template and increments version", async () => {
      const existingSnap = {
        exists: true,
        data: () => ({ ...samplePoll, version: 3 }),
      };
      const get = vi.fn(async () => existingSnap);
      const set = vi.fn(async () => undefined);
      const docFn = vi.fn(() => ({ get, set }));
      const auditAdd = vi.fn(async () => undefined);
      collectionMock.mockImplementation((name: string) => {
        if (name === "minigame_templates") return { doc: docFn };
        if (name === "audit_log") return { add: auditAdd };
        throw new Error("unexpected collection " + name);
      });

      const res = buildRes();
      await handler.update(buildReq(samplePoll, { id: "t1" }), res);

      expect(docFn).toHaveBeenCalledWith("t1");
      expect(set).toHaveBeenCalledTimes(1);
      const setArgs = set.mock.calls[0];
      const stored = setArgs[0] as Record<string, unknown>;
      expect(stored).toMatchObject({ ...samplePoll, version: 4 });
      expect(stored.updatedAt).toBe(fieldValueServerTimestamp);
      expect(setArgs[1]).toEqual({ merge: true });
      expect(res.__body).toEqual({
        success: true,
        data: { id: "t1", version: 4 },
      });
      const auditPayload = auditAdd.mock.calls[0][0] as Record<string, unknown>;
      expect(auditPayload).toMatchObject({
        action: "minigame_template.update",
        targetId: "t1",
        details: { type: "poll", title: samplePoll.title, version: 4 },
      });
    });

    it("returns 404 when template does not exist", async () => {
      const docFn = vi.fn(() => ({
        get: vi.fn(async () => ({ exists: false })),
        set: vi.fn(),
      }));
      collectionMock.mockReturnValue({ doc: docFn });
      const res = buildRes();
      await handler.update(buildReq(samplePoll, { id: "ghost" }), res);
      expect(res.__status).toBe(404);
      expect((res.__body as { error: string }).error).toMatch(/not found/i);
    });
  });

  describe("remove", () => {
    it("deletes existing template and writes audit", async () => {
      const get = vi.fn(async () => ({
        exists: true,
        data: () => samplePoll,
      }));
      const deleteFn = vi.fn(async () => undefined);
      const docFn = vi.fn(() => ({ get, delete: deleteFn }));
      const auditAdd = vi.fn(async () => undefined);
      collectionMock.mockImplementation((name: string) => {
        if (name === "minigame_templates") return { doc: docFn };
        if (name === "audit_log") return { add: auditAdd };
        throw new Error("unexpected collection " + name);
      });

      const res = buildRes();
      await handler.remove(buildReq({}, { id: "t1" }), res);
      expect(deleteFn).toHaveBeenCalledTimes(1);
      expect(res.__body).toEqual({ success: true });
      const auditPayload = auditAdd.mock.calls[0][0] as Record<string, unknown>;
      expect(auditPayload).toMatchObject({
        action: "minigame_template.delete",
        targetId: "t1",
        details: { type: "poll", title: samplePoll.title },
      });
    });

    it("returns 404 when template does not exist", async () => {
      const docFn = vi.fn(() => ({
        get: vi.fn(async () => ({ exists: false })),
        delete: vi.fn(),
      }));
      collectionMock.mockReturnValue({ doc: docFn });
      const res = buildRes();
      await handler.remove(buildReq({}, { id: "ghost" }), res);
      expect(res.__status).toBe(404);
    });
  });
});
