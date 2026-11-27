import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const docMock = vi.fn();
  const incrementMock = vi.fn((n: number) => ({ __increment: n }));
  const serverTsMock = vi.fn(() => "__SERVER_TS__");
  return { docMock, incrementMock, serverTsMock };
});

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(() => ({ doc: mocks.docMock }), {
    FieldValue: {
      increment: mocks.incrementMock,
      serverTimestamp: mocks.serverTsMock,
    },
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: mocks.incrementMock,
    serverTimestamp: mocks.serverTsMock,
  },
}));

vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: (_path: string, handler: unknown) => handler,
  onDocumentCreated: (_path: string, handler: unknown) => handler,
}));

const { docMock } = mocks;

import {
  configureAggregateCoalescers,
  recomputeAggregatesFromEvent,
  recomputeRouletteAggregateFromJoin,
  type ResponseWriteEvent,
} from "./recomputeAggregates";
import { clearMinigameCaches } from "../services/minigameCache";

function createEvent(
  data: { questionId?: string; optionId?: string } | undefined,
  opts: { beforeExists?: boolean; afterExists?: boolean; respId?: string } = {}
): ResponseWriteEvent {
  const { beforeExists = false, afterExists = true, respId = "u1_q1" } = opts;
  return {
    data: {
      before: { exists: beforeExists },
      after: {
        exists: afterExists,
        data: () => data,
      },
    },
    params: { slug: "devfest-2025", id: "instance-A", respId },
  };
}

interface ParticipantFixture {
  id: string;
  alias?: string;
  quizScore?: number;
}

function wire(options: {
  instanceType?: string;
  participants?: ParticipantFixture[];
  existingWinners?: unknown[];
}) {
  const basePath = "events/devfest-2025/minigames/instance-A";
  const aggregatePath = `${basePath}/aggregates/current`;
  const pollShards = new Map<
    string,
    { optionCounts: Record<string, number>; totalResponses: number }
  >();
  const rouletteShards = new Map<string, { count: number }>();

  const aggregateSet = vi.fn(async () => undefined);
  const aggregateRef = {
    set: aggregateSet,
    get: vi.fn(async () => ({
      exists: Boolean(options.existingWinners),
      data: () =>
        options.existingWinners
          ? { winners: options.existingWinners }
          : undefined,
    })),
  };

  const participantsGet = vi.fn(async () => ({
    docs: (options.participants ?? []).map((p) => ({
      id: p.id,
      data: () => ({ alias: p.alias, quizScore: p.quizScore }),
    })),
  }));
  const participantsLimit = vi.fn(() => ({ get: participantsGet }));
  const participantsOrderBy = vi.fn(() => ({ limit: participantsLimit }));
  const participantsCol = { orderBy: participantsOrderBy };

  const instanceCollection = vi.fn((name: string) => {
    if (name === "participants") return participantsCol;
    if (name === "poll_shards") {
      return {
        get: vi.fn(async () => ({
          docs: [...pollShards.entries()].map(([id, data]) => ({
            id,
            data: () => data,
          })),
        })),
      };
    }
    if (name === "roulette_shards") {
      return {
        get: vi.fn(async () => ({
          docs: [...rouletteShards.entries()].map(([id, data]) => ({
            id,
            data: () => data,
          })),
        })),
      };
    }
    throw new Error("unexpected nested collection " + name);
  });

  const instanceGet = vi.fn(async () => ({
    exists: Boolean(options.instanceType),
    data: () =>
      options.instanceType ? { type: options.instanceType } : undefined,
  }));
  const instanceRef = {
    get: instanceGet,
    collection: instanceCollection,
  };

  docMock.mockImplementation((path: string) => {
    if (path === aggregatePath) return aggregateRef;
    if (path === basePath) return instanceRef;
    if (path.startsWith(`${basePath}/poll_shards/`)) {
      const shardId = path.split("/").at(-1)!;
      return {
        set: vi.fn(async (payload: Record<string, unknown>) => {
          const current = pollShards.get(shardId) ?? {
            optionCounts: {},
            totalResponses: 0,
          };
          const incTotal =
            (payload.totalResponses as { __increment?: number })?.__increment ??
            0;
          current.totalResponses += incTotal;
          const optsMap = payload.optionCounts as Record<
            string,
            { __increment?: number }
          >;
          for (const [k, v] of Object.entries(optsMap ?? {})) {
            current.optionCounts[k] =
              (current.optionCounts[k] ?? 0) + (v.__increment ?? 0);
          }
          pollShards.set(shardId, current);
        }),
      };
    }
    if (path.startsWith(`${basePath}/roulette_shards/`)) {
      const shardId = path.split("/").at(-1)!;
      return {
        set: vi.fn(async (payload: Record<string, unknown>) => {
          const current = rouletteShards.get(shardId) ?? { count: 0 };
          current.count +=
            (payload.count as { __increment?: number })?.__increment ?? 0;
          rouletteShards.set(shardId, current);
        }),
      };
    }
    return undefined;
  });

  return { aggregateSet, participantsLimit, pollShards, rouletteShards };
}

describe("recomputeAggregatesFromEvent", () => {
  beforeEach(() => {
    docMock.mockReset();
    clearMinigameCaches();
    configureAggregateCoalescers(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates sharded optionCounts and totalResponses on create (poll)", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" }, { respId: "u1_q1" })
    );
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(1);
    const [payload, options] = wiring.aggregateSet.mock.calls[0];
    expect(payload.optionCounts).toEqual({ "q1:a": 1 });
    expect(payload.totalResponses).toBe(1);
    expect(payload.updatedAt).toBe("__SERVER_TS__");
    expect(options).toEqual({ merge: true });
  });

  it("coalesces bursts across shards into a single aggregate write", async () => {
    configureAggregateCoalescers(20);
    const wiring = wire({ instanceType: "poll" });
    await Promise.all([
      recomputeAggregatesFromEvent(
        createEvent({ questionId: "q1", optionId: "a" }, { respId: "u1_q1" })
      ),
      recomputeAggregatesFromEvent(
        createEvent({ questionId: "q1", optionId: "b" }, { respId: "u2_q1" })
      ),
      recomputeAggregatesFromEvent(
        createEvent({ questionId: "q1", optionId: "a" }, { respId: "u3_q1" })
      ),
    ]);
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(1);
    const [payload] = wiring.aggregateSet.mock.calls[0];
    expect(payload.optionCounts).toEqual({ "q1:a": 2, "q1:b": 1 });
    expect(payload.totalResponses).toBe(3);
  });

  it("ignores updates, deletes and malformed responses", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" }, { beforeExists: true })
    );
    await recomputeAggregatesFromEvent(
      createEvent(undefined, { afterExists: false })
    );
    await recomputeAggregatesFromEvent(createEvent({ questionId: "q1" }));
    await recomputeAggregatesFromEvent(createEvent({ optionId: "a" }));
    expect(wiring.aggregateSet).not.toHaveBeenCalled();
  });

  it("rebuilds the leaderboard for legacy quiz instances ordered by score desc", async () => {
    const wiring = wire({
      instanceType: "quiz",
      participants: [
        { id: "u1", alias: "Ana", quizScore: 300 },
        { id: "u2", alias: "Bea", quizScore: 200 },
      ],
    });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    expect(wiring.participantsLimit).toHaveBeenCalledWith(10);
    const [payload] = wiring.aggregateSet.mock.calls[0];
    expect(payload.leaderboard).toEqual([
      { uid: "u1", alias: "Ana", score: 300 },
      { uid: "u2", alias: "Bea", score: 200 },
    ]);
  });

  it("aggregates roulette participant joins into eligibleCount", async () => {
    configureAggregateCoalescers(20);
    const wiring = wire({
      instanceType: "roulette",
      existingWinners: [{ uid: "w1", alias: "Ganador", spinNumber: 1 }],
    });
    await Promise.all([
      recomputeRouletteAggregateFromJoin({
        params: { slug: "devfest-2025", id: "instance-A", uid: "u1" },
      }),
      recomputeRouletteAggregateFromJoin({
        params: { slug: "devfest-2025", id: "instance-A", uid: "u2" },
      }),
      recomputeRouletteAggregateFromJoin({
        params: { slug: "devfest-2025", id: "instance-A", uid: "u3" },
      }),
    ]);
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(1);
    const [payload] = wiring.aggregateSet.mock.calls[0];
    expect(payload.totalParticipants).toBe(3);
    expect(payload.eligibleCount).toBe(2);
  });

  it("aggregates quiz participant joins into totalParticipants for the waiting lobby", async () => {
    configureAggregateCoalescers(20);
    const wiring = wire({ instanceType: "quiz" });
    await Promise.all([
      recomputeRouletteAggregateFromJoin({
        params: { slug: "devfest-2025", id: "instance-A", uid: "u1" },
      }),
      recomputeRouletteAggregateFromJoin({
        params: { slug: "devfest-2025", id: "instance-A", uid: "u2" },
      }),
    ]);
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(1);
    const [payload] = wiring.aggregateSet.mock.calls[0];
    expect(payload.totalParticipants).toBe(2);
    expect(payload.eligibleCount).toBeUndefined();
  });

  it("ignores participant joins for poll instances", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeRouletteAggregateFromJoin({
      params: { slug: "devfest-2025", id: "instance-A", uid: "u1" },
    });
    expect(wiring.aggregateSet).not.toHaveBeenCalled();
  });
});
