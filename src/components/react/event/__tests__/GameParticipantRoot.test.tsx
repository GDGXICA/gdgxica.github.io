import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useLiveMinigames: vi.fn(),
  signIn: vi.fn(),
  join: vi.fn(),
}));

vi.mock("../useLiveMinigames", () => ({
  useLiveMinigames: mocks.useLiveMinigames,
}));
vi.mock("@/lib/firebase", () => ({ signInAnonymouslyIfNeeded: mocks.signIn }));
vi.mock("@/lib/api", () => ({ api: { joinEventMinigames: mocks.join } }));
vi.mock("../PollOverlay", () => ({
  PollOverlay: ({ title }: { title: string }) => <div>Encuesta: {title}</div>,
}));
vi.mock("../QuizOverlay", () => ({
  QuizOverlay: ({ title }: { title: string }) => <div>Quiz: {title}</div>,
}));

import { GameParticipantRoot } from "../GameParticipantRoot";

const liveInstances = [
  {
    id: "poll-1",
    type: "poll",
    mode: "realtime",
    state: "live",
    title: "Encuesta uno",
    config: { questions: [] },
    currentQuestionIndex: -1,
  },
  {
    id: "quiz-1",
    type: "quiz",
    mode: "realtime",
    state: "live",
    title: "Quiz dos",
    config: { questions: [] },
    currentQuestionIndex: -1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/events/devfest/jugar");
  mocks.signIn.mockResolvedValue({ uid: "u1" });
  mocks.useLiveMinigames.mockReturnValue({
    liveInstances,
    loading: false,
    error: null,
  });
  mocks.join.mockResolvedValue({
    success: true,
    data: { alias: "Ana", instances: [{ id: "poll-1" }, { id: "quiz-1" }] },
  });
});
afterEach(() => cleanup());

describe("GameParticipantRoot", () => {
  it("offers a lobby when there is no game id", async () => {
    render(<GameParticipantRoot slug="devfest" eventName="DevFest" />);
    expect(screen.getByRole("link", { name: /Encuesta uno/ })).toHaveAttribute(
      "href",
      "?game=poll-1"
    );
    expect(screen.getByRole("link", { name: /Quiz dos/ })).toHaveAttribute(
      "href",
      "?game=quiz-1"
    );
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalled());
  });

  it("joins and shows only the selected game in its own view", async () => {
    window.history.replaceState({}, "", "/events/devfest/jugar?game=poll-1");
    localStorage.setItem("gdg_minigame_alias_devfest", "Ana");
    render(<GameParticipantRoot slug="devfest" eventName="DevFest" />);
    await waitFor(() =>
      expect(screen.getByText("Encuesta: Encuesta uno")).toBeInTheDocument()
    );
    expect(screen.queryByText("Quiz: Quiz dos")).not.toBeInTheDocument();
    expect(mocks.join).toHaveBeenCalledWith("devfest", { alias: "Ana" });
  });
});
