import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useLiveMinigames: vi.fn(),
  useMinigameInstance: vi.fn(),
  signIn: vi.fn(),
  join: vi.fn(),
}));

vi.mock("../useLiveMinigames", () => ({
  useLiveMinigames: mocks.useLiveMinigames,
}));
vi.mock("../useMinigameInstance", () => ({
  useMinigameInstance: mocks.useMinigameInstance,
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
  mocks.useMinigameInstance.mockImplementation(
    (_slug: string | null, gameId: string | null) => ({
      instance: liveInstances.find((item) => item.id === gameId) ?? null,
      loading: false,
      error: null,
    })
  );
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
    expect(mocks.join).toHaveBeenCalledWith("devfest", {
      alias: "Ana",
      instanceId: "poll-1",
    });
  });

  it("shows connecting status instead of Entrar while auto-joining", async () => {
    window.history.replaceState({}, "", "/events/devfest/jugar?game=poll-1");
    localStorage.setItem("gdg_minigame_alias_devfest", "Ana");
    let resolveJoin!: (value: unknown) => void;
    mocks.join.mockReturnValue(
      new Promise((resolve) => {
        resolveJoin = resolve;
      })
    );
    render(<GameParticipantRoot slug="devfest" eventName="DevFest" />);
    expect(await screen.findByText(/Conectando al juego/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Entrar/ })).toBeNull();
    resolveJoin({
      success: true,
      data: { alias: "Ana", instances: [{ id: "poll-1" }] },
    });
    await waitFor(() =>
      expect(screen.getByText("Encuesta: Encuesta uno")).toBeInTheDocument()
    );
  });

  it("navigates between lobby and a game via SPA pushState without reload", async () => {
    localStorage.setItem("gdg_minigame_alias_devfest", "Ana");
    render(<GameParticipantRoot slug="devfest" eventName="DevFest" />);
    const link = screen.getByRole("link", { name: /Encuesta uno/ });
    fireEvent.click(link);
    expect(window.location.search).toBe("?game=poll-1");
    await waitFor(() =>
      expect(screen.getByText("Encuesta: Encuesta uno")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Dinámicas/i }));
    expect(window.location.search).toBe("");
    expect(screen.getByText("Elige una dinámica")).toBeInTheDocument();
  });

  it("renders closed game final view directly without prompting to join", async () => {
    window.history.replaceState(
      {},
      "",
      "/events/devfest/jugar?game=quiz-closed"
    );
    mocks.useMinigameInstance.mockReturnValue({
      instance: {
        id: "quiz-closed",
        type: "quiz",
        mode: "realtime",
        state: "closed",
        title: "Quiz terminado",
        config: { questions: [] },
        currentQuestionIndex: 0,
      },
      loading: false,
      error: null,
    });
    render(<GameParticipantRoot slug="devfest" eventName="DevFest" />);
    await waitFor(() =>
      expect(screen.getByText("Quiz: Quiz terminado")).toBeInTheDocument()
    );
    expect(screen.getByText("Finalizado")).toBeInTheDocument();
    expect(mocks.join).not.toHaveBeenCalled();
  });
});
