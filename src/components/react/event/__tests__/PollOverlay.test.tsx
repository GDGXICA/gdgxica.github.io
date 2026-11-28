import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
  answerPollQuestion: vi.fn(),
  useAggregates: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ getFirestore: mocks.getFirestore }));
vi.mock("firebase/firestore", () => ({ getDoc: mocks.getDoc, doc: mocks.doc }));
vi.mock("@/lib/api", () => ({
  api: { answerPollQuestion: mocks.answerPollQuestion },
}));
vi.mock("../useAggregates", () => ({ useAggregates: mocks.useAggregates }));

import { PollOverlay } from "../PollOverlay";

const config = {
  questions: [
    {
      id: "q1",
      prompt: "Primera",
      options: [
        { id: "a", label: "Sí" },
        { id: "b", label: "No" },
      ],
    },
    {
      id: "q2",
      prompt: "Segunda",
      options: [
        { id: "a", label: "Rojo" },
        { id: "b", label: "Azul" },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getFirestore.mockResolvedValue({});
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.answerPollQuestion.mockResolvedValue({ success: true });
  mocks.useAggregates.mockReturnValue({ aggregates: null });
});
afterEach(() => cleanup());

function renderPoll(index = 0) {
  return render(
    <PollOverlay
      slug="evt"
      instanceId="poll"
      uid="u1"
      alias="Ana"
      title="Varias"
      config={config}
      currentQuestionIndex={index}
    />
  );
}

describe("PollOverlay", () => {
  it("waits for the organizer before showing a question", () => {
    renderPoll(-1);
    expect(
      screen.getByText(/Esperando la primera pregunta/)
    ).toBeInTheDocument();
  });

  it("shows only the active question and submits its option to the API", async () => {
    renderPoll(1);
    expect(screen.getByText("Segunda")).toBeInTheDocument();
    expect(screen.queryByText("Primera")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Rojo" }));
    await waitFor(() =>
      expect(mocks.answerPollQuestion).toHaveBeenCalledWith(
        "evt",
        "poll",
        "q2",
        "a"
      )
    );
    expect(screen.getByText("Tu voto")).toBeInTheDocument();
  });

  it("restores an earlier vote after reload", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ optionId: "b" }),
    });
    mocks.useAggregates.mockReturnValue({
      aggregates: { optionCounts: { "q1:a": 3, "q1:b": 1 } },
    });
    renderPoll();
    await waitFor(() =>
      expect(screen.getByText("Tu voto")).toBeInTheDocument()
    );
    expect(screen.getByText(/3 · 75%/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sí" })
    ).not.toBeInTheDocument();
  });

  it("reports server validation errors", async () => {
    mocks.answerPollQuestion.mockResolvedValue({
      success: false,
      error: "Pregunta cerrada",
    });
    renderPoll();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sí" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pregunta cerrada"
    );
  });

  it("treats already_answered (409) as confirmed vote", async () => {
    mocks.answerPollQuestion.mockResolvedValue({
      success: false,
      status: 409,
      error: "already_answered",
    });
    renderPoll();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sí" }));
    expect(await screen.findByText("Tu voto")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores stale responses when the question advances mid-flight", async () => {
    let resolveFirst!: (value: { success: boolean }) => void;
    mocks.answerPollQuestion.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
    );
    const { rerender } = renderPoll(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sí" }));
    expect(screen.getByText("Enviando…")).toBeInTheDocument();

    rerender(
      <PollOverlay
        slug="evt"
        instanceId="poll"
        uid="u1"
        alias="Ana"
        title="Varias"
        config={config}
        currentQuestionIndex={1}
      />
    );
    expect(screen.getByRole("button", { name: "Rojo" })).toBeEnabled();

    resolveFirst({ success: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rojo" })).toBeEnabled()
    );
    expect(screen.queryByText("Tu voto")).toBeNull();
  });

  it("defers aggregates subscription until after voting and skips restore when justJoined", async () => {
    render(
      <PollOverlay
        slug="evt"
        instanceId="poll"
        uid="u1"
        alias="Ana"
        title="Varias"
        config={config}
        currentQuestionIndex={0}
        justJoined
      />
    );
    expect(mocks.useAggregates).toHaveBeenLastCalledWith(null, null);
    expect(mocks.getDoc).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Sí" }));
    await waitFor(() =>
      expect(mocks.useAggregates).toHaveBeenLastCalledWith("evt", "poll")
    );
  });

  it("shows bars optimistically on tap before the server responds and rolls back on failure", async () => {
    let resolveVote!: (value: { success: boolean; error?: string }) => void;
    mocks.answerPollQuestion.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVote = resolve;
      })
    );
    renderPoll(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sí" }));
    // Immediately marks vote and shows optimistic count (1 · 100%) without waiting
    expect(screen.getByText("Enviando…")).toBeInTheDocument();
    expect(screen.getByText(/1 · 100%/)).toBeInTheDocument();
    expect(mocks.useAggregates).toHaveBeenLastCalledWith("evt", "poll");

    // Rolls back cleanly if the server rejects the vote
    resolveVote({ success: false, error: "not_live" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí" })).toBeEnabled();
  });
});
