import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fieldValueServerTimestamp = "__SERVER_TS__";

const mocks = vi.hoisted(() => ({
  collectionMock: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(() => ({ collection: mocks.collectionMock }), {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TS__",
    },
  }),
}));

import * as handler from "./minigameInstances";
import type { AuthenticatedRequest } from "../middleware/auth";

const { collectionMock } = mocks;

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

const SAMPLE_POLL_TEMPLATE = {
  type: "poll" as const,
  title: "Pick one",
  description: "",
  poll: {
    question: "Q?",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  },
  version: 3,
};

const SAMPLE_QUIZ_TEMPLATE = {
  type: "quiz" as const,
  title: "Mini Quiz",
  description: "",
  quiz: {
    questions: [
      {
        id: "q1",
        prompt: "?",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        correctOptionId: "a",
        timeLimitSec: 30,
        points: 100,
      },
      {
        id: "q2",
        prompt: "??",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        correctOptionId: "b",
        timeLimitSec: 20,
        points: 100,
      },
    ],
  },
  version: 1,
};

const SAMPLE_BINGO_TEMPLATE = {
  type: "bingo" as const,
  title: "Buzzword",
  description: "",
  bingo: {
    terms: Array.from({ length: 16 }, (_, i) => `t${i}`),
    cardSize: 4 as const,
    freeCenter: false,
  },
  version: 1,
};

interface InstanceRefStub {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface CollectionWiring {
  template?: { exists: boolean; data?: () => unknown };
  instance?: { exists: boolean; data?: () => unknown };
  // Mocks captured for later assertions:
  eventSet: ReturnType<typeof vi.fn>;
  instanceAdd: ReturnType<typeof vi.fn>;
  instanceRef: InstanceRefStub;
  auditAdd: ReturnType<typeof vi.fn>;
  instancesOrderBy: ReturnType<typeof vi.fn>;
  instanceListGet: ReturnType<typeof vi.fn>;
}

function wireCollections(
  templateData: { exists: boolean; data?: () => unknown },
  instanceData: { exists: boolean; data?: () => unknown },
  listDocs: Array<{ id: string; data: () => unknown }> = []
): CollectionWiring {
  const eventSet = vi.fn(async () => undefined);
  const instanceAdd = vi.fn(async () => ({ id: "new-instance-id" }));
  const auditAdd = vi.fn(async () => undefined);
  const instanceListGet = vi.fn(async () => ({ docs: listDocs }));
  const orderByInner = vi.fn(() => ({ get: instanceListGet }));
  const instancesOrderBy = vi.fn(() => ({ orderBy: orderByInner }));

  const instanceRef: InstanceRefStub = {
    get: vi.fn(async () => instanceData),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };

  const eventDoc = vi.fn(() => ({
    set: eventSet,
    collection: vi.fn(() => ({
      doc: vi.fn(() => instanceRef),
      add: instanceAdd,
      orderBy: instancesOrderBy,
    })),
  }));

  const templateRef = {
    get: vi.fn(async () => templateData),
  };

  collectionMock.mockImplementation((name: string) => {
    if (name === "events") return { doc: eventDoc };
    if (name === "minigame_templates") return { doc: () => templateRef };
    if (name === "audit_log") return { add: auditAdd };
    throw new Error("unexpected collection " + name);
  });

  return {
    eventSet,
    instanceAdd,
    instanceRef,
    auditAdd,
    instancesOrderBy,
    instanceListGet,
  };
}

describe("minigameInstances handler", () => {
  beforeEach(() => {
    collectionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("attach", () => {
    it("snapshots a poll template and creates the shadow event doc", async () => {
      const wiring = wireCollections(
        { exists: true, data: () => SAMPLE_POLL_TEMPLATE },
        { exists: false }
      );
      const res = buildRes();
      await handler.attach(
        buildReq({ templateId: "tpl-1", order: 0 }, { slug: "devfest-2025" }),
        res
      );

      expect(wiring.eventSet).toHaveBeenCalledTimes(1);
      const [eventPayload, eventOpts] = wiring.eventSet.mock.calls[0];
      expect(eventPayload).toMatchObject({ slug: "devfest-2025" });
      expect(eventOpts).toEqual({ merge: true });

      expect(wiring.instanceAdd).toHaveBeenCalledTimes(1);
      const stored = wiring.instanceAdd.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(stored).toMatchObject({
        eventSlug: "devfest-2025",
        templateId: "tpl-1",
        templateVersion: 3,
        type: "poll",
        mode: "realtime",
        state: "scheduled",
        title: "Pick one",
        config: SAMPLE_POLL_TEMPLATE.poll,
        order: 0,
        createdBy: "admin-uid",
      });
      expect(stored.createdAt).toBe(fieldValueServerTimestamp);
      // Poll has no quiz fields.
      expect(stored.currentQuestionIndex).toBeUndefined();

      expect(res.__status).toBe(201);
      expect(res.__body).toEqual({
        success: true,
        data: { id: "new-instance-id", type: "poll" },
      });

      const auditPayload = wiring.auditAdd.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(auditPayload).toMatchObject({
        action: "minigame_instance.attach",
        targetId: "new-instance-id",
        targetType: "minigame_instance",
      });
    });

    it("seeds quiz runtime fields when attaching a quiz template", async () => {
      const wiring = wireCollections(
        { exists: true, data: () => SAMPLE_QUIZ_TEMPLATE },
        { exists: false }
      );
      const res = buildRes();
      await handler.attach(
        buildReq({ templateId: "tpl-q", order: 1 }, { slug: "devfest-2025" }),
        res
      );
      const stored = wiring.instanceAdd.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(stored).toMatchObject({
        type: "quiz",
        mode: "realtime",
        currentQuestionIndex: -1,
        currentQuestionStartedAt: null,
      });
      expect(stored.config).toEqual(SAMPLE_QUIZ_TEMPLATE.quiz);
    });

    it("derives mode='global' for bingo", async () => {
      const wiring = wireCollections(
        { exists: true, data: () => SAMPLE_BINGO_TEMPLATE },
        { exists: false }
      );
      const res = buildRes();
      await handler.attach(
        buildReq({ templateId: "tpl-b", order: 0 }, { slug: "devfest-2025" }),
        res
      );
      const stored = wiring.instanceAdd.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(stored.type).toBe("bingo");
      expect(stored.mode).toBe("global");
      expect(stored.currentQuestionIndex).toBeUndefined();
    });

    it("returns 404 if template does not exist", async () => {
      wireCollections({ exists: false }, { exists: false });
      const res = buildRes();
      await handler.attach(
        buildReq({ templateId: "missing", order: 0 }, { slug: "devfest-2025" }),
        res
      );
      expect(res.__status).toBe(404);
      expect((res.__body as { error: string }).error).toMatch(
        /template not found/i
      );
    });
  });

  describe("setState", () => {
    it("sets state=live and stamps activatedAt", async () => {
      const wiring = wireCollections(
        { exists: false },
        { exists: true, data: () => ({ state: "scheduled" }) }
      );
      const res = buildRes();
      await handler.setState(
        buildReq({ state: "live" }, { slug: "x", id: "i1" }),
        res
      );
      expect(wiring.instanceRef.update).toHaveBeenCalledWith({
        state: "live",
        activatedAt: fieldValueServerTimestamp,
      });
      expect(res.__body).toEqual({
        success: true,
        data: { id: "i1", state: "live" },
      });
    });

    it("allows reopening (closed -> live)", async () => {
      const wiring = wireCollections(
        { exists: false },
        { exists: true, data: () => ({ state: "closed" }) }
      );
      const res = buildRes();
      await handler.setState(
        buildReq({ state: "live" }, { slug: "x", id: "i1" }),
        res
      );
      expect(wiring.instanceRef.update).toHaveBeenCalled();
      expect(res.__status).toBeUndefined();
    });

    it("stamps closedAt when going to closed", async () => {
      const wiring = wireCollections(
        { exists: false },
        { exists: true, data: () => ({ state: "live" }) }
      );
      const res = buildRes();
      await handler.setState(
        buildReq({ state: "closed" }, { slug: "x", id: "i1" }),
        res
      );
      expect(wiring.instanceRef.update).toHaveBeenCalledWith({
        state: "closed",
        closedAt: fieldValueServerTimestamp,
      });
    });

    it("returns 404 when instance is missing", async () => {
      wireCollections({ exists: false }, { exists: false });
      const res = buildRes();
      await handler.setState(
        buildReq({ state: "live" }, { slug: "x", id: "ghost" }),
        res
      );
      expect(res.__status).toBe(404);
    });
  });

  describe("quizAdvance", () => {
    it("increments currentQuestionIndex and stamps startedAt", async () => {
      const wiring = wireCollections(
        { exists: false },
        {
          exists: true,
          data: () => ({
            type: "quiz",
            state: "live",
            currentQuestionIndex: 0,
            config: { questions: [{ id: "q1" }, { id: "q2" }] },
          }),
        }
      );
      const res = buildRes();
      await handler.quizAdvance(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(wiring.instanceRef.update).toHaveBeenCalledWith({
        currentQuestionIndex: 1,
        currentQuestionStartedAt: fieldValueServerTimestamp,
      });
      expect(res.__body).toEqual({
        success: true,
        data: { id: "i1", currentQuestionIndex: 1 },
      });
    });

    it("rejects non-quiz instances", async () => {
      wireCollections(
        { exists: false },
        {
          exists: true,
          data: () => ({ type: "poll", state: "live" }),
        }
      );
      const res = buildRes();
      await handler.quizAdvance(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(res.__status).toBe(400);
    });

    it("rejects when state is not live", async () => {
      wireCollections(
        { exists: false },
        {
          exists: true,
          data: () => ({ type: "quiz", state: "scheduled" }),
        }
      );
      const res = buildRes();
      await handler.quizAdvance(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(res.__status).toBe(400);
    });

    it("rejects when already on the last question", async () => {
      wireCollections(
        { exists: false },
        {
          exists: true,
          data: () => ({
            type: "quiz",
            state: "live",
            currentQuestionIndex: 1,
            config: { questions: [{ id: "q1" }, { id: "q2" }] },
          }),
        }
      );
      const res = buildRes();
      await handler.quizAdvance(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/last/i);
    });
  });

  describe("remove", () => {
    it("deletes a scheduled instance", async () => {
      const wiring = wireCollections(
        { exists: false },
        { exists: true, data: () => ({ state: "scheduled", title: "X" }) }
      );
      const res = buildRes();
      await handler.remove(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(wiring.instanceRef.delete).toHaveBeenCalled();
      expect(res.__body).toEqual({ success: true });
    });

    it("returns 409 when instance is live", async () => {
      const wiring = wireCollections(
        { exists: false },
        { exists: true, data: () => ({ state: "live" }) }
      );
      const res = buildRes();
      await handler.remove(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(wiring.instanceRef.delete).not.toHaveBeenCalled();
      expect(res.__status).toBe(409);
    });

    it("returns 409 when instance is closed", async () => {
      wireCollections(
        { exists: false },
        { exists: true, data: () => ({ state: "closed" }) }
      );
      const res = buildRes();
      await handler.remove(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(res.__status).toBe(409);
    });

    it("returns 404 when instance is missing", async () => {
      wireCollections({ exists: false }, { exists: false });
      const res = buildRes();
      await handler.remove(buildReq({}, { slug: "x", id: "ghost" }), res);
      expect(res.__status).toBe(404);
    });
  });

  describe("list", () => {
    it("returns docs ordered by order asc, createdAt asc", async () => {
      const wiring = wireCollections({ exists: false }, { exists: false }, [
        { id: "i1", data: () => ({ order: 0, type: "poll" }) },
        { id: "i2", data: () => ({ order: 1, type: "quiz" }) },
      ]);
      const res = buildRes();
      await handler.list(buildReq({}, { slug: "x" }), res);
      expect(wiring.instancesOrderBy).toHaveBeenCalledWith("order", "asc");
      expect(res.__body).toEqual({
        success: true,
        data: [
          { id: "i1", order: 0, type: "poll" },
          { id: "i2", order: 1, type: "quiz" },
        ],
      });
    });
  });
});
