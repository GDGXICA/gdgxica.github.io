import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  answerQuizQuestion: vi.fn(),
  getFirestore: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
  useAggregates: vi.fn(),
  useParticipantDoc: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { answerQuizQuestion: mocks.answerQuizQuestion },
}));
vi.mock("@/lib/firebase", () => ({ getFirestore: mocks.getFirestore }));
vi.mock("firebase/firestore", () => ({ getDoc: mocks.getDoc, doc: mocks.doc }));
vi.mock("../useAggregates", () => ({ useAggregates: mocks.useAggregates }));
vi.mock("../useParticipantDoc", () => ({
  useParticipantDoc: mocks.useParticipantDoc,
}));

import { QuizOverlay } from "../QuizOverlay";
import {
  recordServerClockSample,
  resetServerClockOffset,
} from "@/lib/serverClock";

const config = {
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
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFirestore.mockResolvedValue({});
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.answerQuizQuestion.mockResolvedValue({ success: true });
  mocks.useAggregates.mockReturnValue({ aggregates: null });
  mocks.useParticipantDoc.mockReturnValue({
    doc: { uid: "u1", alias: "Ana", quizScore: 0 },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetServerClockOffset();
});

function renderQuiz(index = 0) {
  return render(
    <QuizOverlay
      slug="evt"
      instanceId="inst"
      uid="u1"
      alias="Ana"
      title="Quiz"
      config={config}
      currentQuestionIndex={index}
      currentQuestionStartedAt={{ seconds: Date.now() / 1000 }}
    />
  );
}

describe("QuizOverlay", () => {
  it("waits for the organizer to start", () => {
    renderQuiz(-1);
    expect(
      screen.getByText(/Esperando que el organizador/i)
    ).toBeInTheDocument();
  });

  it("submits only the selected option to the API and hides correctness", async () => {
    renderQuiz();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Gemini" }));
    await waitFor(() =>
      expect(mocks.answerQuizQuestion).toHaveBeenCalledWith(
        "evt",
        "inst",
        "q1",
        "a"
      )
    );
    expect(screen.getByText(/Respuesta registrada/)).toBeInTheDocument();
    expect(screen.queryByText(/Correcto/)).not.toBeInTheDocument();
  });

  it("restores a prior answer without offering a second vote", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ optionId: "b" }),
    });
    renderQuiz();
    await waitFor(() =>
      expect(screen.getByText(/Respuesta registrada/)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Gemini" })).toBeDisabled();
  });

  it("reveals the correct answer and points only after the server publishes results", () => {
    mocks.useAggregates.mockReturnValue({
      aggregates: {
        revealedAnswers: { q1: "a" },
        optionCounts: { "q1:a": 2, "q1:b": 1 },
        leaderboard: [{ uid: "u1", alias: "Ana", score: 100 }],
      },
    });
    mocks.useParticipantDoc.mockReturnValue({
      doc: {
        uid: "u1",
        alias: "Ana",
        quizScore: 100,
        lastQuizQuestionId: "q1",
        lastQuizPoints: 100,
      },
    });
    renderQuiz();
    expect(screen.getByText(/Correcto/)).toBeInTheDocument();
    expect(screen.getByText("+100 puntos")).toBeInTheDocument();
    expect(screen.getByText("Clasificación")).toBeInTheDocument();
  });

  it("marks the tapped option optimistically and recovers cleanly on 409", async () => {
    mocks.answerQuizQuestion.mockResolvedValue({
      success: false,
      status: 409,
      error: "already_answered",
    });
    renderQuiz();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Gemini" }));
    expect(await screen.findByText(/Respuesta registrada/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses server clock offset so a fast device clock does not prematurely lock options", () => {
    const serverNow = Date.now() - 45_000;
    recordServerClockSample(serverNow, Date.now());
    render(
      <QuizOverlay
        slug="evt"
        instanceId="inst"
        uid="u1"
        alias="Ana"
        title="Quiz"
        config={config}
        currentQuestionIndex={0}
        currentQuestionStartedAt={{ seconds: serverNow / 1000 }}
        justJoined
      />
    );
    expect(screen.getByRole("button", { name: "Gemini" })).toBeEnabled();
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it("renders personal placement and Top 3 podium when closed", () => {
    mocks.useAggregates.mockReturnValue({
      aggregates: {
        leaderboard: [
          { uid: "u2", alias: "Luis", score: 300 },
          { uid: "u1", alias: "Ana", score: 250 },
          { uid: "u3", alias: "Sofía", score: 150 },
        ],
      },
    });
    render(
      <QuizOverlay
        slug="evt"
        instanceId="inst"
        uid="u1"
        alias="Ana"
        title="Quiz"
        config={config}
        currentQuestionIndex={0}
        closed
      />
    );
    expect(screen.getByText(/Quedaste en #2/i)).toBeInTheDocument();
    expect(screen.getByText(/250 puntos/i)).toBeInTheDocument();
    expect(screen.getByText(/Clasificación final/i)).toBeInTheDocument();
  });

  it("keeps the submitted answer locked when a Firestore snapshot delivers a cloned config", async () => {
    const startedAt = { seconds: Math.floor(Date.now() / 1000) };
    const { rerender } = render(
      <QuizOverlay
        slug="evt"
        instanceId="inst"
        uid="u1"
        alias="Ana"
        title="Quiz"
        config={config}
        currentQuestionIndex={0}
        currentQuestionStartedAt={startedAt}
        justJoined
      />
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Gemini" }));
    expect(await screen.findByText(/Respuesta registrada/)).toBeInTheDocument();

    const clonedConfig = {
      questions: config.questions.map((q) => ({
        ...q,
        options: [...q.options],
      })),
    };
    rerender(
      <QuizOverlay
        slug="evt"
        instanceId="inst"
        uid="u1"
        alias="Ana"
        title="Quiz"
        config={clonedConfig}
        currentQuestionIndex={0}
        currentQuestionStartedAt={startedAt}
        justJoined
      />
    );
    expect(screen.getByText(/Respuesta registrada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gemini" })).toBeDisabled();
  });
});
