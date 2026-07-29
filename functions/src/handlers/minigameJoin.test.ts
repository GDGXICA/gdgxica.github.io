import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SERVER_TS = "__SERVER_TS__";

const mocks = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  runTransactionMock: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(
    () => ({
      collection: mocks.collectionMock,
      runTransaction: mocks.runTransactionMock,
    }),
    {
      FieldValue: {
        serverTimestamp: () => "__SERVER_TS__",
      },
    }
  ),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
  },
}));

import * as handler from "./minigameJoin";
import type { AuthenticatedRequest } from "../middleware/auth";

const { collectionMock, runTransactionMock } = mocks;

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

function buildReq(
  body: unknown,
  params: Record<string, string> = {},
  uid = "anon-uid-1"
): Request {
  const req = {
    body,
    params,
    user: { uid },
  } as unknown as AuthenticatedRequest;
  return req as unknown as Request;
}

interface InstanceFixture {
  id: string;
  type: string;
  state: string;
  config?: {
    terms?: string[];
    classic?: boolean;
    maxWinnersPerDraw?: number;
  };
  existingParticipant?: {
    alias: string;
    bingoCard?: string[];
  };
  // Classic mode only: the calling sequence already sealed for this
  // instance, and the winning balls other participants have reserved.
  sealedOrder?: string[];
  takenWinIndices?: number[];
}

interface WiringResult {
  txCalls: Array<Record<string, unknown>>;
  setCalls: Array<{ ref: object; data: Record<string, unknown> }>;
  slotCalls: Array<{ instanceId: string; data: Record<string, unknown> }>;
  sealCalls: Array<{ instanceId: string; data: Record<string, unknown> }>;
  auditAdd: ReturnType<typeof vi.fn>;
}

function wireFirestore(liveInstances: InstanceFixture[]): WiringResult {
  const setCalls: Array<{ ref: object; data: Record<string, unknown> }> = [];
  const slotCalls: Array<{
    instanceId: string;
    data: Record<string, unknown>;
  }> = [];
  const sealCalls: Array<{
    instanceId: string;
    data: Record<string, unknown>;
  }> = [];
  const auditAdd = vi.fn(async () => undefined);

  const instanceDocs = liveInstances.map((i) => {
    const participantRef = { __participantFor: i.id };
    const drawRef = { __drawFor: i.id };
    const slotDocRef = { __slotFor: i.id };
    // The occupancy query the dealer runs inside the transaction. It
    // carries the fixture's reserved balls so tx.get can answer it.
    const slotQuery = {
      __slotQueryFor: i.id,
      __taken: i.takenWinIndices ?? [],
    };

    const sealTransaction = vi.fn(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        get: vi.fn(async () => ({
          data: () => (i.sealedOrder ? { order: i.sealedOrder } : undefined),
        })),
        set: vi.fn((_ref: object, data: Record<string, unknown>) => {
          sealCalls.push({ instanceId: i.id, data });
          // Later reads in the same test see the sealed sequence.
          i.sealedOrder = data.order as string[];
        }),
      };
      return cb(tx);
    });

    const ref = {
      id: i.id,
      firestore: { runTransaction: sealTransaction },
      collection: vi.fn((name: string) => {
        if (name === "participants") {
          return { doc: vi.fn(() => participantRef) };
        }
        if (name === "secret") {
          return {
            doc: vi.fn(() => ({
              ...drawRef,
              get: vi.fn(async () => ({
                data: () =>
                  i.sealedOrder ? { order: i.sealedOrder } : undefined,
              })),
            })),
          };
        }
        if (name === "slots") {
          return {
            doc: vi.fn(() => slotDocRef),
            where: vi.fn(() => slotQuery),
          };
        }
        throw new Error("unexpected nested collection " + name);
      }),
      __participantRef: participantRef,
      __slotDocRef: slotDocRef,
      __slotQuery: slotQuery,
    };
    return {
      id: i.id,
      data: () => ({ type: i.type, state: i.state, config: i.config }),
      ref,
      __existing: i.existingParticipant,
    };
  });

  const limitMock = vi.fn(() => ({
    get: vi.fn(async () => ({
      empty: instanceDocs.length === 0,
      docs: instanceDocs,
    })),
  }));
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const minigamesCol = { where: whereMock };
  const eventDocFn = vi.fn(() => ({
    collection: vi.fn(() => minigamesCol),
  }));

  collectionMock.mockImplementation((name: string) => {
    if (name === "events") return { doc: eventDocFn };
    if (name === "audit_log") return { add: auditAdd };
    throw new Error("unexpected collection " + name);
  });

  runTransactionMock.mockImplementation(async (callback) => {
    // Find which instance ref the upcoming tx.set/get refers to. We
    // expose `tx.get(participantRef)`, `tx.get(slotQuery)` and
    // `tx.set(ref, data)`.
    const tx = {
      get: vi.fn(async (ref: object) => {
        const query = ref as { __slotQueryFor?: string; __taken?: number[] };
        if (query.__slotQueryFor) {
          return {
            docs: (query.__taken ?? []).map((winIndex, n) => ({
              id: `other-${n}`,
              data: () => ({ winIndex }),
            })),
          };
        }
        const inst = instanceDocs.find((d) => d.ref.__participantRef === ref);
        if (inst?.__existing) {
          return { exists: true, data: () => inst.__existing };
        }
        return { exists: false };
      }),
      set: vi.fn((ref: object, data: Record<string, unknown>) => {
        const slotOwner = instanceDocs.find((d) => d.ref.__slotDocRef === ref);
        if (slotOwner) {
          slotCalls.push({ instanceId: slotOwner.id, data });
          return;
        }
        setCalls.push({ ref, data });
      }),
    };
    await callback(tx);
  });

  return { txCalls: [], setCalls, slotCalls, sealCalls, auditAdd };
}

const POLL_INSTANCE: InstanceFixture = {
  id: "i-poll",
  type: "poll",
  state: "live",
};

const QUIZ_INSTANCE: InstanceFixture = {
  id: "i-quiz",
  type: "quiz",
  state: "live",
};

const BINGO_INSTANCE: InstanceFixture = {
  id: "i-bingo",
  type: "bingo",
  state: "live",
  config: { terms: Array.from({ length: 25 }, (_, i) => `term-${i}`) },
};

describe("minigameJoin handler", () => {
  beforeEach(() => {
    collectionMock.mockReset();
    runTransactionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty alias", async () => {
    wireFirestore([]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "   " }, { slug: "x" }), res);
    expect(res.__status).toBe(400);
    expect((res.__body as { error: string }).error).toMatch(/alias/i);
  });

  it("rejects profane alias", async () => {
    wireFirestore([]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "FUCKER" }, { slug: "x" }), res);
    expect(res.__status).toBe(400);
  });

  it("returns alias with empty instances list when no game is live", async () => {
    wireFirestore([]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);
    expect(res.__status).toBeUndefined();
    expect(res.__body).toEqual({
      success: true,
      data: { alias: "Ana", instances: [] },
    });
  });

  it("creates participant doc for a poll instance without bingo card", async () => {
    const wiring = wireFirestore([POLL_INSTANCE]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);
    expect(wiring.setCalls).toHaveLength(1);
    const stored = wiring.setCalls[0].data;
    expect(stored).toMatchObject({
      uid: "anon-uid-1",
      alias: "Ana",
    });
    expect(stored.bingoCard).toBeUndefined();
    expect(stored.joinedAt).toBe(SERVER_TS);
    const body = res.__body as { data: { instances: { joined: boolean }[] } };
    expect(body.data.instances[0].joined).toBe(true);
  });

  it("seeds a deterministic bingo card for bingo instances", async () => {
    const wiring = wireFirestore([BINGO_INSTANCE]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Bea" }, { slug: "x" }), res);
    expect(wiring.setCalls).toHaveLength(1);
    const stored = wiring.setCalls[0].data;
    const card = stored.bingoCard as string[];
    expect(Array.isArray(card)).toBe(true);
    expect(card).toHaveLength(16);
    expect(new Set(card).size).toBe(16);
    const body = res.__body as {
      data: { instances: { bingoCard?: string[] }[] };
    };
    expect(body.data.instances[0].bingoCard).toEqual(card);
  });

  it("joins multiple live instances in one call with a single alias", async () => {
    const wiring = wireFirestore([
      POLL_INSTANCE,
      QUIZ_INSTANCE,
      BINGO_INSTANCE,
    ]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Carlos" }, { slug: "x" }), res);
    expect(wiring.setCalls).toHaveLength(3);
    for (const call of wiring.setCalls) {
      expect(call.data.alias).toBe("Carlos");
      expect(call.data.uid).toBe("anon-uid-1");
    }
    const types = (
      res.__body as { data: { instances: { type: string }[] } }
    ).data.instances.map((i) => i.type);
    expect(types.sort()).toEqual(["bingo", "poll", "quiz"]);
  });

  it("is idempotent on rejoin and returns the original alias", async () => {
    const wiring = wireFirestore([
      {
        ...POLL_INSTANCE,
        existingParticipant: { alias: "OriginalAna" },
      },
    ]);
    const res = buildRes();
    await handler.join(
      buildReq({ alias: "DifferentAlias" }, { slug: "x" }),
      res
    );
    expect(wiring.setCalls).toHaveLength(0); // No new write
    const body = res.__body as {
      data: { alias: string; instances: { joined: boolean }[] };
    };
    expect(body.data.alias).toBe("OriginalAna");
    expect(body.data.instances[0].joined).toBe(false);
  });

  it("preserves the existing bingo card on rejoin", async () => {
    const existingCard = Array.from({ length: 16 }, (_, i) => `keep-${i}`);
    wireFirestore([
      {
        ...BINGO_INSTANCE,
        existingParticipant: { alias: "Bea", bingoCard: existingCard },
      },
    ]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Bea" }, { slug: "x" }), res);
    const body = res.__body as {
      data: { instances: { bingoCard?: string[] }[] };
    };
    expect(body.data.instances[0].bingoCard).toEqual(existingCard);
  });

  it("logs an audit entry per /join call (not per instance)", async () => {
    const wiring = wireFirestore([POLL_INSTANCE, QUIZ_INSTANCE]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);
    expect(wiring.auditAdd).toHaveBeenCalledTimes(1);
    const audit = wiring.auditAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(audit).toMatchObject({
      action: "minigame_participant.join",
      performedBy: "anon-uid-1",
      targetId: "x",
      targetType: "event",
    });
    const details = audit.details as {
      alias: string;
      instanceCount: number;
      newJoins: number;
    };
    expect(details).toMatchObject({
      alias: "Ana",
      instanceCount: 2,
      newJoins: 2,
    });
  });

  it("handles a malformed bingo template by skipping card seeding", async () => {
    wireFirestore([
      {
        ...BINGO_INSTANCE,
        config: { terms: ["only-three", "ok-fine", "uno-mas"] },
      },
    ]);
    const res = buildRes();
    await handler.join(buildReq({ alias: "Test" }, { slug: "x" }), res);
    // Should not throw / not 500. Card empty in summary.
    expect(res.__status).toBeUndefined();
  });

  describe("classic bingo — staggered card dealing", () => {
    const CLASSIC_TERMS = Array.from({ length: 50 }, (_, i) => `t${i + 1}`);
    const classicInstance = (
      overrides: Partial<InstanceFixture> = {}
    ): InstanceFixture => ({
      id: "i-classic",
      type: "bingo",
      state: "live",
      config: { terms: CLASSIC_TERMS, classic: true, maxWinnersPerDraw: 1 },
      sealedOrder: [...CLASSIC_TERMS].reverse(),
      ...overrides,
    });

    it("deals a card and reserves the ball it wins on", async () => {
      const wiring = wireFirestore([classicInstance()]);
      const res = buildRes();
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);

      expect(wiring.setCalls).toHaveLength(1);
      expect(wiring.setCalls[0].data.bingoCard).toHaveLength(16);
      expect(wiring.slotCalls).toHaveLength(1);
      const slot = wiring.slotCalls[0].data;
      expect(slot.uid).toBe("anon-uid-1");
      expect(typeof slot.winIndex).toBe("number");
      expect(slot.relaxed).toBe(false);
    });

    it("keeps the winning ball out of the world-readable participant doc", async () => {
      const wiring = wireFirestore([classicInstance()]);
      const res = buildRes();
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);

      const stored = wiring.setCalls[0].data;
      expect(stored.winIndex).toBeUndefined();
      expect(stored.bingoWinIndex).toBeUndefined();
      // And nothing in the API response leaks it either.
      expect(JSON.stringify(res.__body)).not.toContain("winIndex");
    });

    it("re-deals when the ball it would win on is already taken", async () => {
      // Deal once with nothing reserved to learn the natural ball...
      const first = wireFirestore([classicInstance()]);
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), buildRes());
      const natural = first.slotCalls[0].data.winIndex as number;
      const naturalCard = first.setCalls[0].data.bingoCard;

      // ...then reserve exactly that ball and join again as the same uid.
      const second = wireFirestore([
        classicInstance({ takenWinIndices: [natural] }),
      ]);
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), buildRes());

      expect(second.slotCalls[0].data.winIndex).not.toBe(natural);
      expect(second.setCalls[0].data.bingoCard).not.toEqual(naturalCard);
      expect(second.slotCalls[0].data.relaxed).toBe(false);
    });

    it("seals the calling sequence when the instance has none yet", async () => {
      const wiring = wireFirestore([
        classicInstance({ sealedOrder: undefined }),
      ]);
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), buildRes());
      expect(wiring.sealCalls).toHaveLength(1);
      expect(wiring.sealCalls[0].data.order).toHaveLength(50);
      expect(wiring.slotCalls).toHaveLength(1);
    });

    it("still deals when every candidate ball is taken, flagging the squeeze", async () => {
      // Reserve a wide swathe of balls so no candidate can be free.
      const wiring = wireFirestore([
        classicInstance({
          takenWinIndices: Array.from({ length: 50 }, (_, i) => i + 1),
        }),
      ]);
      const res = buildRes();
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);
      expect(res.__status).toBeUndefined();
      expect(wiring.setCalls[0].data.bingoCard).toHaveLength(16);
      expect(wiring.slotCalls[0].data.relaxed).toBe(true);
    });

    it("does not touch the private collections in conference mode", async () => {
      const wiring = wireFirestore([
        {
          id: "i-conference",
          type: "bingo",
          state: "live",
          config: { terms: CLASSIC_TERMS },
        },
      ]);
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), buildRes());
      expect(wiring.slotCalls).toHaveLength(0);
      expect(wiring.sealCalls).toHaveLength(0);
      expect(wiring.setCalls[0].data.bingoCard).toHaveLength(16);
    });

    it("hands out no card when a classic bank is too small, without failing the join", async () => {
      const wiring = wireFirestore([
        classicInstance({
          config: { terms: ["a", "b", "c"], classic: true },
          sealedOrder: undefined,
        }),
      ]);
      const res = buildRes();
      await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);
      expect(res.__status).toBeUndefined();
      expect(wiring.setCalls[0].data.bingoCard).toEqual([]);
      expect(wiring.slotCalls).toHaveLength(0);
    });
  });

  it("returns 500 when Firestore unexpectedly throws", async () => {
    collectionMock.mockImplementation(() => {
      throw new Error("kaboom");
    });
    const res = buildRes();
    await handler.join(buildReq({ alias: "Ana" }, { slug: "x" }), res);
    expect(res.__status).toBe(500);
  });
});
