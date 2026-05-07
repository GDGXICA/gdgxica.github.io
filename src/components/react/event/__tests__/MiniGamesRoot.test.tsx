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
    window.history.replaceState({}, "", "/eventos/x");
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

  it("forces the modal open when ?play=1 is in the URL even with stored alias", async () => {
    window.localStorage.setItem("gdg_minigame_alias_x", "Ana");
    window.history.replaceState({}, "", "/eventos/x?play=1");
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
