import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LiveInstance } from "../types";

const mocks = vi.hoisted(() => ({
  joinEventMinigames: vi.fn(),
  signInAnonymouslyIfNeeded: vi.fn(),
  // useLiveMinigames is a hook; we replace it with a controllable mock so
  // tests can drive the live-instance state without real Firestore.
  useLiveMinigames: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    joinEventMinigames: mocks.joinEventMinigames,
  },
}));

vi.mock("@/lib/firebase", () => ({
  signInAnonymouslyIfNeeded: mocks.signInAnonymouslyIfNeeded,
}));

vi.mock("../useLiveMinigames", () => ({
  useLiveMinigames: mocks.useLiveMinigames,
}));

// Shallow-stub the presentational children so this file can exercise
// MiniGamesRoot's own layout logic (which section renders where) without
// also wiring up each child's Firestore-backed hooks.
vi.mock("../BingoCardView", () => ({
  BingoCardView: () => <div data-testid="bingo-card">bingo</div>,
}));
vi.mock("../WordCloudView", () => ({
  WordCloudView: () => <div data-testid="wordcloud">wordcloud</div>,
}));
vi.mock("../RouletteView", () => ({
  RouletteView: () => <div data-testid="roulette">roulette</div>,
}));
vi.mock("../PollOverlay", () => ({
  PollOverlay: () => <div data-testid="poll-overlay">poll</div>,
}));
vi.mock("../QuizOverlay", () => ({
  QuizOverlay: () => <div data-testid="quiz-overlay">quiz</div>,
}));

import { MiniGamesRoot } from "../MiniGamesRoot";

const POLL: LiveInstance = {
  id: "i-poll",
  type: "poll",
  mode: "realtime",
  state: "live",
  title: "Live poll",
  order: 0,
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.signInAnonymouslyIfNeeded.mockResolvedValue({ uid: "anon-uid" });
  mocks.joinEventMinigames.mockResolvedValue({
    success: true,
    data: {
      alias: "Ana",
      instances: [{ id: "i-poll", type: "poll", joined: true }],
    },
  });
  mocks.useLiveMinigames.mockReturnValue({
    loading: false,
    liveInstances: [],
    error: null,
  });
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    // jsdom default location is about:blank; emulate ?play=0 by clearing.
    window.history.replaceState({}, "", "/events/x");
  }
});

afterEach(() => cleanup());

describe("MiniGamesRoot", () => {
  it("renders nothing when there are no live games", async () => {
    render(<MiniGamesRoot slug="x" />);
    await waitFor(() =>
      expect(mocks.signInAnonymouslyIfNeeded).toHaveBeenCalled()
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/Conectado como/i)).not.toBeInTheDocument();
  });

  it("shows the join modal when a live game appears and there's no alias", async () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL],
      error: null,
    });
    render(<MiniGamesRoot slug="x" />);
    expect(
      await screen.findByRole("dialog", { name: /únete con un alias/i })
    ).toBeInTheDocument();
  });

  it("auto-rejoins silently when there is a stored alias", async () => {
    window.localStorage.setItem("gdg_minigame_alias_x", "Ana");
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL],
      error: null,
    });
    render(<MiniGamesRoot slug="x" />);
    await waitFor(() =>
      expect(mocks.joinEventMinigames).toHaveBeenCalledWith("x", {
        alias: "Ana",
      })
    );
    expect(await screen.findByText(/Conectado como/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits a chosen alias and switches to the connected indicator", async () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL],
      error: null,
    });
    const user = userEvent.setup();
    render(<MiniGamesRoot slug="x" />);
    await screen.findByRole("dialog");
    await user.type(screen.getByPlaceholderText(/ej\. ana/i), "Carlos");
    mocks.joinEventMinigames.mockResolvedValueOnce({
      success: true,
      data: {
        alias: "Carlos",
        instances: [{ id: "i-poll", type: "poll", joined: true }],
      },
    });
    await user.click(screen.getByRole("button", { name: /Conectarme/i }));
    await waitFor(() =>
      expect(window.localStorage.getItem("gdg_minigame_alias_x")).toBe("Carlos")
    );
    expect(await screen.findByText(/Conectado como/i)).toBeInTheDocument();
  });

  it("dismisses the modal when Cerrar is clicked and stays dismissed", async () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL],
      error: null,
    });
    const user = userEvent.setup();
    render(<MiniGamesRoot slug="x" />);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /^Cerrar$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.joinEventMinigames).not.toHaveBeenCalled();
  });

  it("silently re-joins when a new live instance appears after already joined", async () => {
    // Participant joins while only the poll is live.
    window.localStorage.setItem("gdg_minigame_alias_x", "Ana");
    const { rerender } = render(<MiniGamesRoot slug="x" />);

    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL],
      error: null,
    });
    rerender(<MiniGamesRoot slug="x" />);

    await waitFor(() =>
      expect(mocks.joinEventMinigames).toHaveBeenCalledTimes(1)
    );

    // Quiz goes live after the participant already joined — new instance.
    const QUIZ: LiveInstance = {
      id: "i-quiz",
      type: "quiz",
      mode: "realtime",
      state: "live",
      title: "Live quiz",
      order: 1,
    };
    mocks.joinEventMinigames.mockResolvedValueOnce({
      success: true,
      data: {
        alias: "Ana",
        instances: [
          { id: "i-poll", type: "poll", joined: false },
          { id: "i-quiz", type: "quiz", joined: true },
        ],
      },
    });
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL, QUIZ],
      error: null,
    });
    rerender(<MiniGamesRoot slug="x" />);

    // Should re-join automatically to get a participant doc for the quiz.
    await waitFor(() =>
      expect(mocks.joinEventMinigames).toHaveBeenCalledTimes(2)
    );
    expect(mocks.joinEventMinigames).toHaveBeenLastCalledWith("x", {
      alias: "Ana",
    });
  });

  it("keeps the global games section reachable when a realtime game is also live", async () => {
    // Regression test: the realtime (poll/quiz) overlay used to be a
    // fixed inset-0 scrim that completely blocked pointer events on the
    // global games section (bingo/wordcloud/roulette) rendered above it.
    window.localStorage.setItem("gdg_minigame_alias_x", "Ana");
    const BINGO: LiveInstance = {
      id: "i-bingo",
      type: "bingo",
      mode: "global",
      state: "live",
      title: "Live bingo",
      order: 0,
    };
    const POLL_WITH_CONFIG: LiveInstance = {
      ...POLL,
      config: { question: "Q?", options: [] },
    };
    mocks.joinEventMinigames.mockResolvedValue({
      success: true,
      data: {
        alias: "Ana",
        instances: [
          { id: "i-bingo", type: "bingo", joined: true },
          { id: "i-poll", type: "poll", joined: true },
        ],
      },
    });
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [BINGO, POLL_WITH_CONFIG],
      error: null,
    });
    render(<MiniGamesRoot slug="x" />);

    // Both sections mount...
    expect(await screen.findByTestId("bingo-card")).toBeInTheDocument();
    const realtimeRegion = await screen.findByRole("region", {
      name: /juegos en tiempo real/i,
    });
    expect(realtimeRegion).toBeInTheDocument();

    // ...and the realtime overlay is no longer a full-viewport scrim that
    // covers/blocks the global games section rendered above it. Assert
    // both the absence of a full-viewport footprint AND the absence of
    // the opaque backdrop, so re-blocking the page with different-but-
    // equivalent CSS (e.g. "inset-y-0 inset-x-0" instead of the literal
    // "inset-0" string, or reintroducing the dark scrim) still fails
    // this test even though it wouldn't match /inset-0/ alone.
    expect(realtimeRegion.className).not.toMatch(/inset-0/);
    expect(realtimeRegion.className).not.toMatch(/\btop-0\b/);
    expect(realtimeRegion.className).not.toMatch(/\bbg-black\b/);
    expect(realtimeRegion.className).toMatch(/\bbottom-0\b/);
    expect(realtimeRegion.className).toMatch(/max-h-/);

    // And the global games section reserves enough space below itself
    // that it can never end up scrolled underneath the fixed panel.
    const bingoCard = screen.getByTestId("bingo-card");
    const globalSection = bingoCard.closest("section");
    expect(globalSection?.className).toMatch(/pb-\[70vh\]/);
  });

  it("forces the modal open when ?play=1 is in the URL even with stored alias", async () => {
    window.localStorage.setItem("gdg_minigame_alias_x", "Ana");
    window.history.replaceState({}, "", "/events/x?play=1");
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [POLL],
      error: null,
    });
    render(<MiniGamesRoot slug="x" />);
    expect(
      await screen.findByRole("dialog", { name: /únete con un alias/i })
    ).toBeInTheDocument();
  });
});
