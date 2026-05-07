import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "__TS__"),
  increment: vi.fn((n: number) => ({ __increment: n })),
  arrayUnion: vi.fn((value: string) => ({ __arrayUnion: value })),
  useAggregates: vi.fn(),
  useParticipantDoc: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestore: mocks.getFirestore,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  setDoc: mocks.setDoc,
  serverTimestamp: mocks.serverTimestamp,
  increment: mocks.increment,
  arrayUnion: mocks.arrayUnion,
}));

vi.mock("../useAggregates", () => ({
  useAggregates: mocks.useAggregates,
}));

vi.mock("../useParticipantDoc", () => ({
  useParticipantDoc: mocks.useParticipantDoc,
}));

import { QuizOverlay } from "../QuizOverlay";

const QUIZ_CONFIG = {
  questions: [
    {
      id: "q1",
      prompt: "¿Cuál es multimodal?",
      options: [
        { id: "a", label: "Gemini" },
        { id: "b", label: "GPT-2" },
      ],
      correctOptionId: "a",
      timeLimitSec: 30,
      points: 100,
    },
    {
      id: "q2",
      prompt: "¿Qué significa RAG?",
      options: [
        { id: "a", label: "Retrieval Augmented Generation" },
        { id: "b", label: "Random Arbitrary Generator" },
      ],
      correctOptionId: "a",
      timeLimitSec: 30,
      points: 100,
    },
  ],
};

const NOW_MS = 1_700_000_000_000;

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (
      typeof (m as unknown as { mockReset?: () => void }).mockReset ===
      "function"
    ) {
      (m as unknown as { mockReset: () => void }).mockReset();
    }
  }
  mocks.getFirestore.mockResolvedValue({});
  mocks.doc.mockImplementation(() => ({ __ref: true }));
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.serverTimestamp.mockReturnValue("__TS__");
  mocks.increment.mockImplementation((n: number) => ({ __increment: n }));
  mocks.arrayUnion.mockImplementation((value: string) => ({
    __arrayUnion: value,
  }));
  mocks.useAggregates.mockReturnValue({
    aggregates: null,
    loading: false,
    error: null,
  });
  mocks.useParticipantDoc.mockReturnValue({
    doc: { uid: "u1", alias: "Ana" },
    loading: false,
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// Helper used by tests that need a fixed clock (timer-related assertions).
// Tests that simulate user interactions skip this so userEvent's internal
// timers stay on the real clock.
function pinClock(toMs: number) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(toMs));
}

describe("QuizOverlay", () => {
  it("renders the waiting state when currentQuestionIndex is -1", () => {
    render(
      <QuizOverlay
        slug="x"
        instanceId="i"
        uid="u1"
        alias="Ana"
        title="Mini quiz"
        config={QUIZ_CONFIG}
        currentQuestionIndex={-1}
      />
    );
    expect(
      screen.getByText(/Esperando que el organizador/i)
    ).toBeInTheDocument();
  });

  it("renders the current question with countdown", () => {
    pinClock(NOW_MS);
    const startedAtMs = NOW_MS - 5000; // 5s elapsed
    render(
      <QuizOverlay
        slug="x"
        instanceId="i"
        uid="u1"
        alias="Ana"
        title="Mini quiz"
        config={QUIZ_CONFIG}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: startedAtMs / 1000 }}
      />
    );
    expect(screen.getByText("¿Cuál es multimodal?")).toBeInTheDocument();
    expect(screen.getByText(/Pregunta 1 \/ 2/)).toBeInTheDocument();
    // 30s limit - 5s elapsed = 25s remaining.
    expect(screen.getByLabelText(/Tiempo restante/)).toHaveTextContent("25s");
  });

  it("submits the answer and updates participant doc", async () => {
    const user = userEvent.setup();
    render(
      <QuizOverlay
        slug="evt"
        instanceId="inst"
        uid="user-1"
        alias="Ana"
        title="t"
        config={QUIZ_CONFIG}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: Date.now() / 1000 }}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gemini/ }));
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(2));
    const responsePayload = mocks.setDoc.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(responsePayload).toMatchObject({
      uid: "user-1",
      questionId: "q1",
      optionId: "a",
      isCorrect: true,
      pointsEarned: 100,
    });
    const participantPayload = mocks.setDoc.mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(participantPayload).toMatchObject({
      quizScore: { __increment: 100 },
      quizAnsweredQuestions: { __arrayUnion: "q1" },
    });
    const participantOptions = mocks.setDoc.mock.calls[1][2] as {
      merge?: boolean;
    };
    expect(participantOptions).toEqual({ merge: true });
  });

  it("awards 0 points on incorrect answer", async () => {
    const user = userEvent.setup();
    render(
      <QuizOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="t"
        config={QUIZ_CONFIG}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: Date.now() / 1000 }}
      />
    );
    await user.click(screen.getByRole("button", { name: /GPT-2/ }));
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(2));
    const responsePayload = mocks.setDoc.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(responsePayload.isCorrect).toBe(false);
    expect(responsePayload.pointsEarned).toBe(0);
  });

  it("locks options when the participant has already answered the question", () => {
    pinClock(NOW_MS);
    mocks.useParticipantDoc.mockReturnValue({
      doc: {
        uid: "u",
        alias: "Ana",
        quizAnsweredQuestions: ["q1"],
        quizScore: 100,
      },
      loading: false,
      error: null,
    });
    render(
      <QuizOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="t"
        config={QUIZ_CONFIG}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: NOW_MS / 1000 }}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Gemini/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Correcto/i)).toBeInTheDocument();
    expect(screen.getByText(/Tu puntuación/i)).toHaveTextContent("100");
  });

  it("locks options and shows results once the timer expires", () => {
    pinClock(NOW_MS);
    const startedAtMs = NOW_MS - 31_000; // already past 30s limit
    render(
      <QuizOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="t"
        config={QUIZ_CONFIG}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: startedAtMs / 1000 }}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Gemini/ })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Tiempo restante/)).toHaveTextContent("0s");
  });

  it("renders the leaderboard when aggregates include one", () => {
    pinClock(NOW_MS);
    mocks.useAggregates.mockReturnValue({
      aggregates: {
        leaderboard: [
          { uid: "u1", alias: "Ana", score: 200 },
          { uid: "u2", alias: "Bea", score: 100 },
        ],
      },
      loading: false,
      error: null,
    });
    render(
      <QuizOverlay
        slug="x"
        instanceId="i"
        uid="u1"
        alias="Ana"
        title="t"
        config={QUIZ_CONFIG}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: NOW_MS / 1000 }}
      />
    );
    expect(screen.getByText(/1\. Ana \(tú\)/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Bea/)).toBeInTheDocument();
  });
});

// silence unused-import warning when pinClock isn't used by every block
void pinClock;
