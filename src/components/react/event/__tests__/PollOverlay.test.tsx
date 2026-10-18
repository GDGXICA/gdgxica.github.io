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
});
