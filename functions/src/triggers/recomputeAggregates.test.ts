import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted, so any vars used inside its factory must be declared
// via vi.hoisted to share initialization order with the mock.
const mocks = vi.hoisted(() => {
  const setMock = vi.fn();
  const docMock = vi.fn(() => ({ set: setMock }));
  const incrementMock = vi.fn((n: number) => ({ __increment: n }));
  const serverTsMock = vi.fn(() => "__SERVER_TS__");
  return { setMock, docMock, incrementMock, serverTsMock };
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

const { setMock, docMock, incrementMock, serverTsMock } = mocks;

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

describe("recomputeAggregatesFromEvent", () => {
  beforeEach(() => {
    setMock.mockReset();
    docMock.mockClear();
    incrementMock.mockClear();
    serverTsMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("increments optionCounts and totalResponses on create", async () => {
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    expect(docMock).toHaveBeenCalledWith(
      "events/devfest-2025/minigames/instance-A/aggregates/current"
    );
    expect(setMock).toHaveBeenCalledTimes(1);
    const [payload, options] = setMock.mock.calls[0];
    expect(payload.optionCounts["q1:a"]).toEqual({ __increment: 1 });
    expect(payload.totalResponses).toEqual({ __increment: 1 });
    expect(payload.updatedAt).toBe("__SERVER_TS__");
    expect(options).toEqual({ merge: true });
  });

  it("uses a separate counter per (question,option) pair", async () => {
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" })
    );
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "b" })
    );
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q2", optionId: "a" })
    );
    const keys = setMock.mock.calls.map(
      (c) => Object.keys((c[0] as { optionCounts: object }).optionCounts)[0]
    );
    expect(keys).toEqual(["q1:a", "q1:b", "q2:a"]);
    expect(setMock).toHaveBeenCalledTimes(3);
  });

  it("ignores updates (before exists)", async () => {
    await recomputeAggregatesFromEvent(
      createEvent({ questionId: "q1", optionId: "a" }, { beforeExists: true })
    );
    expect(setMock).not.toHaveBeenCalled();
  });

  it("ignores deletes (after does not exist)", async () => {
    await recomputeAggregatesFromEvent(
      createEvent(undefined, { afterExists: false })
    );
    expect(setMock).not.toHaveBeenCalled();
  });

  it("ignores malformed responses missing questionId or optionId", async () => {
    await recomputeAggregatesFromEvent(createEvent({ questionId: "q1" }));
    await recomputeAggregatesFromEvent(createEvent({ optionId: "a" }));
    await recomputeAggregatesFromEvent(createEvent({}));
    expect(setMock).not.toHaveBeenCalled();
  });
});
