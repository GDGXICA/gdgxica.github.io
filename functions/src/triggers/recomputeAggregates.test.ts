import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted, so any vars used inside its factory must be declared
// via vi.hoisted to share initialization order with the mock.
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

// Stub `firebase-functions/v2/firestore` so importing the module does not
// require Functions runtime config. We don't invoke the wrapped export
// directly; tests target the exported inner handler.
vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: (_path: string, handler: unknown) => handler,
}));

const { docMock } = mocks;

import {
  recomputeAggregatesFromEvent,
  type ResponseWriteEvent,
} from "./recomputeAggregates";

function createEvent(
  data: { questionId?: string; optionId?: string } | undefined,
  opts: { beforeExists?: boolean; afterExists?: boolean } = {}
): ResponseWriteEvent {
  const { beforeExists = false, afterExists = true } = opts;
  return {
    data: {
      before: { exists: beforeExists },
      after: {
        exists: afterExists,
        data: () => data,
      },
    },
    params: { slug: "devfest-2025", id: "instance-A" },
  };
}

interface ParticipantFixture {
  id: string;
  alias?: string;
  quizScore?: number;
}

interface WireResult {
  aggregateSet: ReturnType<typeof vi.fn>;
  participantsLimit: ReturnType<typeof vi.fn>;
}

function wire(options: {
  instanceType?: string;
  participants?: ParticipantFixture[];
}): WireResult {
  const aggregatePath =
    "events/devfest-2025/minigames/instance-A/aggregates/current";
  const instancePath = "events/devfest-2025/minigames/instance-A";

  const aggregateSet = vi.fn(async () => undefined);
  const aggregateRef = { set: aggregateSet };

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
    throw new Error("unexpected nested collection " + name);
  });
  const instanceGet = vi.fn(async () => ({
    data: () =>
      options.instanceType ? { type: options.instanceType } : undefined,
  }));
  const instanceRef = {
    get: instanceGet,
    collection: instanceCollection,
  };

  docMock.mockImplementation((path: string) => {
    if (path === aggregatePath) return aggregateRef;
    if (path === instancePath) return instanceRef;
    return undefined;
  });

  return { aggregateSet, participantsLimit };
}

describe("recomputeAggregatesFromEvent", () => {
  beforeEach(() => {
    docMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("increments optionCounts and totalResponses on create (poll)", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(1);
    const [payload, options] = wiring.aggregateSet.mock.calls[0];
    expect(payload.optionCounts["q1:a"]).toEqual({ __increment: 1 });
    expect(payload.totalResponses).toEqual({ __increment: 1 });
    expect(payload.updatedAt).toBe("__SERVER_TS__");
    expect(options).toEqual({ merge: true });
  });

  it("uses a separate counter per (question,option) pair", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "b" })
    );
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q2", optionId: "a" })
    );
    const keys = wiring.aggregateSet.mock.calls.map(
      (c) => Object.keys((c[0] as { optionCounts: object }).optionCounts)[0]
    );
    expect(keys).toEqual(["q1:a", "q1:b", "q2:a"]);
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(3);
  });

  it("ignores updates (before exists)", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" }, { beforeExists: true })
    );
    expect(wiring.aggregateSet).not.toHaveBeenCalled();
  });

  it("ignores deletes (after does not exist)", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent(undefined, { afterExists: false })
    );
    expect(wiring.aggregateSet).not.toHaveBeenCalled();
  });

  it("ignores malformed responses missing questionId or optionId", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(createEvent({ questionId: "q1" }));
    await recomputeAggregatesFromEvent(createEvent({ optionId: "a" }));
    await recomputeAggregatesFromEvent(createEvent({}));
    expect(wiring.aggregateSet).not.toHaveBeenCalled();
  });

  it("does not write a leaderboard for poll instances", async () => {
    const wiring = wire({ instanceType: "poll" });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(1);
    const payload = wiring.aggregateSet.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.leaderboard).toBeUndefined();
  });

  it("rebuilds the leaderboard for quiz instances ordered by score desc", async () => {
    const wiring = wire({
      instanceType: "quiz",
      participants: [
        { id: "u1", alias: "Ana", quizScore: 300 },
        { id: "u2", alias: "Bea", quizScore: 200 },
        { id: "u3", alias: "Carlos", quizScore: 100 },
      ],
    });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    expect(wiring.aggregateSet).toHaveBeenCalledTimes(2);
    const leaderboardPayload = wiring.aggregateSet.mock.calls[1][0] as {
      leaderboard: { uid: string; alias: string; score: number }[];
    };
    expect(leaderboardPayload.leaderboard).toEqual([
      { uid: "u1", alias: "Ana", score: 300 },
      { uid: "u2", alias: "Bea", score: 200 },
      { uid: "u3", alias: "Carlos", score: 100 },
    ]);
  });

  it("filters out participants with zero score from the leaderboard", async () => {
    const wiring = wire({
      instanceType: "quiz",
      participants: [
        { id: "u1", alias: "Ana", quizScore: 100 },
        { id: "u2", alias: "Bea" }, // no score yet
        { id: "u3", alias: "Zero", quizScore: 0 },
      ],
    });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    const leaderboardPayload = wiring.aggregateSet.mock.calls[1][0] as {
      leaderboard: unknown[];
    };
    expect(leaderboardPayload.leaderboard).toEqual([
      { uid: "u1", alias: "Ana", score: 100 },
    ]);
  });

  it("uses limit(10) when querying participants", async () => {
    const wiring = wire({
      instanceType: "quiz",
      participants: [{ id: "u1", alias: "Ana", quizScore: 100 }],
    });
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    expect(wiring.participantsLimit).toHaveBeenCalledWith(10);
  });
});
