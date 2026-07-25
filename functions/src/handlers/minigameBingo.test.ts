import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SERVER_TS = "__SERVER_TS__";

const mocks = vi.hoisted(() => ({
  docMock: vi.fn(),
  collectionMock: vi.fn(),
  runTransactionMock: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    doc: mocks.docMock,
    collection: mocks.collectionMock,
    runTransaction: mocks.runTransactionMock,
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
}));

import * as handler from "./minigameBingo";
import type { AuthenticatedRequest } from "../middleware/auth";

const { docMock, collectionMock, runTransactionMock } = mocks;

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

function buildReq(uid = "player-1"): Request {
  return {
    body: {},
    params: { slug: "devfest-2026", id: "bingo-A" },
    user: { uid },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

const CARD = Array.from({ length: 16 }, (_, i) => `c${i}`);
// Row 0 completes on the 4th ball; the filler keeps every other line open.
const ORDER = ["c0", "c1", "c2", "zz", "c3", "c4", "c8", "c12"];

interface Scene {
  instance?: Record<string, unknown>;
  sealedOrder?: string[];
  participant?: Record<string, unknown> | null;
}

interface Wiring {
  instanceUpdates: Array<Record<string, unknown>>;
  participantUpdates: Array<Record<string, unknown>>;
  sealSets: Array<Record<string, unknown>>;
  audit: ReturnType<typeof vi.fn>;
}

// Wires just enough of the Admin SDK for these two handlers: the instance
// doc, its private secret/draw doc, and one participant doc.
function wire(scene: Scene): Wiring {
  const instanceUpdates: Array<Record<string, unknown>> = [];
  const participantUpdates: Array<Record<string, unknown>> = [];
  const sealSets: Array<Record<string, unknown>> = [];
  const audit = vi.fn(async () => undefined);

  const drawRef = { __kind: "draw" };
  const participantRef = { __kind: "participant" };

  const instanceSnap = () => ({
    exists: scene.instance !== undefined,
    data: () => scene.instance,
  });
  const drawSnap = () => ({
    exists: scene.sealedOrder !== undefined,
    data: () => (scene.sealedOrder ? { order: scene.sealedOrder } : undefined),
  });
  const participantSnap = () => ({
    exists: Boolean(scene.participant),
    data: () => scene.participant ?? undefined,
  });

  const runTransaction = vi.fn(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      get: vi.fn(async (ref: { __kind?: string }) => {
        if (ref.__kind === "draw") return drawSnap();
        if (ref.__kind === "participant") return participantSnap();
        return instanceSnap();
      }),
      set: vi.fn((ref: { __kind?: string }, data: Record<string, unknown>) => {
        if (ref.__kind === "draw") sealSets.push(data);
      }),
      update: vi.fn(
        (ref: { __kind?: string }, data: Record<string, unknown>) => {
          if (ref.__kind === "participant") participantUpdates.push(data);
          else instanceUpdates.push(data);
        }
      ),
    };
    return cb(tx);
  });

  const instanceRef = {
    id: "bingo-A",
    firestore: { runTransaction },
    get: vi.fn(async () => instanceSnap()),
    collection: vi.fn((name: string) => {
      if (name === "secret") return { doc: vi.fn(() => drawRef) };
      if (name === "participants") return { doc: vi.fn(() => participantRef) };
      throw new Error("unexpected collection " + name);
    }),
  };

  Object.assign(drawRef, { get: vi.fn(async () => drawSnap()) });
  Object.assign(participantRef, { get: vi.fn(async () => participantSnap()) });

  docMock.mockImplementation(() => instanceRef);
  collectionMock.mockImplementation((name: string) => {
    if (name === "audit_log") return { add: audit };
    throw new Error("unexpected root collection " + name);
  });
  runTransactionMock.mockImplementation(runTransaction);

  return { instanceUpdates, participantUpdates, sealSets, audit };
}

const LIVE_CLASSIC = {
  type: "bingo",
  state: "live",
  config: { terms: ORDER, classic: true, prizes: 3, maxWinnersPerDraw: 1 },
  drawCount: 0,
  drawnTerms: [] as string[],
  bingoWinnerCount: 0,
};

describe("minigameBingo handler", () => {
  beforeEach(() => {
    docMock.mockReset();
    collectionMock.mockReset();
    runTransactionMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  describe("guards shared by both endpoints", () => {
    it("404s an instance that does not exist", async () => {
      wire({});
      const res = buildRes();
      await handler.drawBall(buildReq(), res);
      expect(res.__status).toBe(404);
    });

    it("rejects a non-bingo instance", async () => {
      wire({ instance: { type: "roulette", state: "live" } });
      const res = buildRes();
      await handler.drawBall(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/no es.*bingo/i);
    });

    it("rejects a conference-mode bingo — nobody calls balls there", async () => {
      wire({
        instance: { type: "bingo", state: "live", config: { terms: ORDER } },
      });
      const res = buildRes();
      await handler.drawBall(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/clásico/i);
    });

    it("rejects a bingo that is not live", async () => {
      wire({ instance: { ...LIVE_CLASSIC, state: "scheduled" } });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/en vivo/i);
    });
  });

  describe("drawBall", () => {
    it("calls the next ball from the sealed sequence", async () => {
      const w = wire({ instance: LIVE_CLASSIC, sealedOrder: ORDER });
      const res = buildRes();
      await handler.drawBall(buildReq("admin-1"), res);

      expect(res.__status).toBeUndefined();
      expect((res.__body as { data: unknown }).data).toEqual({
        term: "c0",
        drawCount: 1,
        remaining: ORDER.length - 1,
      });
      expect(w.instanceUpdates[0]).toEqual({
        drawCount: 1,
        drawnTerms: ["c0"],
        lastDrawnTerm: "c0",
        lastDrawAt: SERVER_TS,
      });
    });

    it("advances through the sequence in order, never at random", async () => {
      const w = wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 3,
          drawnTerms: ORDER.slice(0, 3),
        },
        sealedOrder: ORDER,
      });
      const res = buildRes();
      await handler.drawBall(buildReq("admin-1"), res);
      expect((res.__body as { data: { term: string } }).data.term).toBe(
        ORDER[3]
      );
      expect(w.instanceUpdates[0].drawnTerms).toEqual(ORDER.slice(0, 4));
    });

    it("refuses once every ball has been called", async () => {
      wire({
        instance: { ...LIVE_CLASSIC, drawCount: ORDER.length },
        sealedOrder: ORDER,
      });
      const res = buildRes();
      await handler.drawBall(buildReq("admin-1"), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(
        /todas las bolas/i
      );
    });

    it("seals a sequence for an instance that has none yet", async () => {
      const w = wire({ instance: LIVE_CLASSIC });
      const res = buildRes();
      await handler.drawBall(buildReq("admin-1"), res);
      expect(w.sealSets).toHaveLength(1);
      expect((w.sealSets[0].order as string[]).length).toBe(
        new Set(ORDER).size
      );
      expect(res.__status).toBeUndefined();
    });

    it("logs the ball it called", async () => {
      const w = wire({ instance: LIVE_CLASSIC, sealedOrder: ORDER });
      await handler.drawBall(buildReq("admin-1"), buildRes());
      expect(w.audit).toHaveBeenCalledTimes(1);
      expect(w.audit.mock.calls[0][0]).toMatchObject({
        action: "minigame_instance.bingo.draw",
        performedBy: "admin-1",
        details: { term: "c0", drawCount: 1 },
      });
    });
  });

  describe("claim", () => {
    const joined = { alias: "Ana", bingoCard: CARD };

    it("crowns a genuine line and hands out rank 1", async () => {
      const w = wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
        },
        sealedOrder: ORDER,
        participant: joined,
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);

      expect(res.__status).toBeUndefined();
      expect(res.__body).toMatchObject({
        success: true,
        data: { rank: 1, hasPrize: true, prizes: 3, winDraw: 5 },
      });
      expect(w.instanceUpdates[0]).toEqual({ bingoWinnerCount: 1 });
      expect(w.participantUpdates[0]).toMatchObject({
        bingoWonAt: SERVER_TS,
        bingoRank: 1,
        bingoWinDraw: 5,
      });
    });

    it("rebuilds the marks from the called balls, ignoring the client", async () => {
      const w = wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
        },
        sealedOrder: ORDER,
        // The client claims a full card; the server must not believe it.
        participant: {
          ...joined,
          bingoMarked: Array.from({ length: 16 }, () => true),
        },
      });
      await handler.claim(buildReq(), buildRes());
      const stored = w.participantUpdates[0].bingoMarked as boolean[];
      // Only c0..c3 were called (c4 is the 6th ball), so only row 0 is on.
      expect(stored.filter(Boolean)).toHaveLength(4);
      expect(stored.slice(0, 4)).toEqual([true, true, true, true]);
    });

    it("rejects a claim with no line among the called balls", async () => {
      const w = wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 3,
          drawnTerms: ORDER.slice(0, 3),
        },
        sealedOrder: ORDER,
        participant: joined,
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/línea/i);
      expect(w.participantUpdates).toHaveLength(0);
    });

    it("rejects a card whose marks were never called at all", async () => {
      const w = wire({
        instance: { ...LIVE_CLASSIC, drawCount: 0, drawnTerms: [] },
        sealedOrder: ORDER,
        participant: {
          ...joined,
          bingoMarked: Array.from({ length: 16 }, () => true),
        },
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBe(400);
      expect(w.participantUpdates).toHaveLength(0);
    });

    it("assigns ranks in sequence so two claims never tie", async () => {
      const w = wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
          bingoWinnerCount: 2,
        },
        sealedOrder: ORDER,
        participant: joined,
      });
      const res = buildRes();
      await handler.claim(buildReq("player-3"), res);
      expect((res.__body as { data: { rank: number } }).data.rank).toBe(3);
      expect(w.instanceUpdates[0]).toEqual({ bingoWinnerCount: 3 });
    });

    it("marks a winner beyond the prize count as having no prize", async () => {
      wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
          bingoWinnerCount: 3,
        },
        sealedOrder: ORDER,
        participant: joined,
      });
      const res = buildRes();
      await handler.claim(buildReq("player-4"), res);
      expect(res.__body).toMatchObject({
        data: { rank: 4, hasPrize: false },
      });
    });

    it("is idempotent: a second tap returns the rank already held", async () => {
      const w = wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
          bingoWinnerCount: 1,
        },
        sealedOrder: ORDER,
        participant: {
          ...joined,
          bingoWonAt: { seconds: 1 },
          bingoRank: 1,
          bingoWinDraw: 5,
        },
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__body).toMatchObject({
        data: { rank: 1, alreadyWon: true },
      });
      // No second rank minted, no duplicate audit entry.
      expect(w.instanceUpdates).toHaveLength(0);
      expect(w.audit).not.toHaveBeenCalled();
    });

    it("404s somebody who never joined", async () => {
      wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
        },
        sealedOrder: ORDER,
        participant: null,
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBe(404);
    });

    it("rejects a participant with no card", async () => {
      wire({
        instance: {
          ...LIVE_CLASSIC,
          drawCount: 5,
          drawnTerms: ORDER.slice(0, 5),
        },
        sealedOrder: ORDER,
        participant: { alias: "Ana", bingoCard: [] },
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/cartón/i);
    });

    it("falls back to the sealed sequence when drawnTerms is missing", async () => {
      const w = wire({
        instance: {
          type: "bingo",
          state: "live",
          config: { terms: ORDER, classic: true, prizes: 3 },
          drawCount: 5,
        },
        sealedOrder: ORDER,
        participant: joined,
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBeUndefined();
      expect(w.participantUpdates[0].bingoRank).toBe(1);
    });

    it("returns 500 when Firestore unexpectedly throws", async () => {
      docMock.mockImplementation(() => {
        throw new Error("kaboom");
      });
      const res = buildRes();
      await handler.claim(buildReq(), res);
      expect(res.__status).toBe(500);
    });
  });
});
