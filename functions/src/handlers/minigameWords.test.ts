import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SERVER_TS = "__SERVER_TS__";

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

import * as handler from "./minigameWords";
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

interface WireOptions {
  wordsDocs?: Array<{ id: string; data: () => unknown }>;
  wordExists?: boolean;
  wordData?: Record<string, unknown>;
  participantsDocs?: Array<{ id: string; data: () => unknown }>;
}

interface WireResult {
  wordUpdate: ReturnType<typeof vi.fn>;
  auditAdd: ReturnType<typeof vi.fn>;
}

function wire(options: WireOptions = {}): WireResult {
  const wordUpdate = vi.fn(async () => undefined);
  const auditAdd = vi.fn(async () => undefined);
  const wordsGet = vi.fn(async () => ({
    docs: options.wordsDocs ?? [],
  }));
  const wordsOrderBy = vi.fn(() => ({ get: wordsGet }));
  const wordRef = {
    get: vi.fn(async () => ({
      exists: options.wordExists ?? false,
      data: () => options.wordData,
    })),
    update: wordUpdate,
  };
  const wordsDocFn = vi.fn(() => wordRef);

  const participantsGet = vi.fn(async () => ({
    docs: options.participantsDocs ?? [],
  }));
  const participantsOrderBy = vi.fn(() => ({ get: participantsGet }));
  const participantsWhere = vi.fn(() => ({ orderBy: participantsOrderBy }));

  // Use plain functions (not vi.fn) for the inner chain so vitest's
  // spy machinery doesn't introspect them during test teardown — that
  // introspection was calling our outer collectionMock with undefined.
  const innerCollection = (name: string) => {
    if (name === "words") {
      return { orderBy: wordsOrderBy, doc: wordsDocFn };
    }
    if (name === "participants") {
      return { where: participantsWhere };
    }
    throw new Error("unexpected nested collection " + name);
  };
  const minigameDoc = () => ({ collection: innerCollection });
  const minigamesCol = { doc: minigameDoc };
  const middleCollection = () => minigamesCol;
  const eventDocFn = () => ({ collection: middleCollection });

  collectionMock.mockImplementation((name: string) => {
    if (name === "events") return { doc: eventDocFn };
    if (name === "audit_log") return { add: auditAdd };
    // Vitest's clearAllMocks teardown can call the spy with no args
    // when introspecting; return undefined instead of throwing so the
    // test result reflects only handler behaviour.
    return undefined;
  });

  return { wordUpdate, auditAdd };
}

describe("minigameWords handler", () => {
  beforeEach(() => collectionMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  describe("listWords", () => {
    it("returns words ordered by count desc", async () => {
      wire({
        wordsDocs: [
          { id: "hola", data: () => ({ text: "hola", count: 5 }) },
          { id: "mundo", data: () => ({ text: "mundo", count: 3 }) },
        ],
      });
      const res = buildRes();
      await handler.listWords(buildReq({}, { slug: "x", id: "i1" }), res);
      expect(res.__body).toEqual({
        success: true,
        data: [
          { id: "hola", text: "hola", count: 5 },
          { id: "mundo", text: "mundo", count: 3 },
        ],
      });
    });
  });

  describe("setWordHidden", () => {
    it("hides a word and writes audit", async () => {
      const wiring = wire({
        wordExists: true,
        wordData: { text: "bad", count: 1 },
      });
      const res = buildRes();
      await handler.setWordHidden(
        buildReq({ hidden: true }, { slug: "x", id: "i1", wordId: "bad" }),
        res
      );
      expect(wiring.wordUpdate).toHaveBeenCalledWith({
        hidden: true,
        hiddenAt: SERVER_TS,
        hiddenBy: "admin-uid",
      });
      expect(res.__body).toEqual({
        success: true,
        data: { id: "bad", hidden: true },
      });
      const audit = wiring.auditAdd.mock.calls[0][0] as {
        action: string;
      };
      expect(audit.action).toBe("minigame_word.hide");
    });

    it("unhides a word", async () => {
      const wiring = wire({
        wordExists: true,
        wordData: { text: "ok", count: 1, hidden: true },
      });
      const res = buildRes();
      await handler.setWordHidden(
        buildReq({ hidden: false }, { slug: "x", id: "i1", wordId: "ok" }),
        res
      );
      expect(wiring.wordUpdate).toHaveBeenCalledWith({
        hidden: false,
        hiddenAt: null,
        hiddenBy: null,
      });
      const audit = wiring.auditAdd.mock.calls[0][0] as {
        action: string;
      };
      expect(audit.action).toBe("minigame_word.unhide");
    });

    it("returns 404 when the word does not exist", async () => {
      wire({ wordExists: false });
      const res = buildRes();
      await handler.setWordHidden(
        buildReq({ hidden: true }, { slug: "x", id: "i1", wordId: "ghost" }),
        res
      );
      expect(res.__status).toBe(404);
    });
  });

  describe("listWinners", () => {
    it("returns participants with bingoWonAt sorted asc", async () => {
      wire({
        participantsDocs: [
          {
            id: "uid-1",
            data: () => ({ alias: "Ana", bingoWonAt: { seconds: 100 } }),
          },
          {
            id: "uid-2",
            data: () => ({ alias: "Bea", bingoWonAt: { seconds: 200 } }),
          },
        ],
      });
      const res = buildRes();
      await handler.listWinners(buildReq({}, { slug: "x", id: "i1" }), res);
      const data = (res.__body as { data: { id: string }[] }).data;
      expect(data.map((d) => d.id)).toEqual(["uid-1", "uid-2"]);
    });
  });
});
