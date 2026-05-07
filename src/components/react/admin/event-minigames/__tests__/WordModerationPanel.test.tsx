import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listEventMinigameWords: vi.fn(),
  setMinigameWordHidden: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listEventMinigameWords: mocks.listEventMinigameWords,
    setMinigameWordHidden: mocks.setMinigameWordHidden,
  },
}));

import { WordModerationPanel } from "../WordModerationPanel";

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.listEventMinigameWords.mockResolvedValue({
    success: true,
    data: [
      { id: "hola", text: "hola", normalized: "hola", count: 5 },
      { id: "spam", text: "spam", normalized: "spam", count: 1, hidden: true },
    ],
  });
  mocks.setMinigameWordHidden.mockResolvedValue({
    success: true,
    data: { id: "hola", hidden: true },
  });
});

afterEach(() => cleanup());

describe("WordModerationPanel", () => {
  it("renders the words returned from the API", async () => {
    render(
      <WordModerationPanel
        slug="evt"
        instanceId="i1"
        title="Word cloud"
        onClose={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(mocks.listEventMinigameWords).toHaveBeenCalledWith("evt", "i1")
    );
    expect(await screen.findByText("hola")).toBeInTheDocument();
    expect(screen.getByText("spam")).toBeInTheDocument();
    expect(screen.getByText(/oculto/i)).toBeInTheDocument();
  });

  it("calls setMinigameWordHidden when toggling a visible word", async () => {
    const user = userEvent.setup();
    render(
      <WordModerationPanel
        slug="evt"
        instanceId="i1"
        title="Word cloud"
        onClose={vi.fn()}
      />
    );
    await screen.findByText("hola");
    const ocultar = screen
      .getAllByRole("button", { name: /Ocultar/i })
      .find((btn) => btn.textContent === "Ocultar");
    if (!ocultar) throw new Error("Ocultar button not found");
    await user.click(ocultar);
    await waitFor(() =>
      expect(mocks.setMinigameWordHidden).toHaveBeenCalledWith(
        "evt",
        "i1",
        "hola",
        true
      )
    );
  });

  it("calls onClose when ✕ is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WordModerationPanel
        slug="evt"
        instanceId="i1"
        title="Word cloud"
        onClose={onClose}
      />
    );
    await screen.findByText("hola");
    await user.click(screen.getByRole("button", { name: /^Cerrar$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an empty state when no words are submitted", async () => {
    mocks.listEventMinigameWords.mockResolvedValueOnce({
      success: true,
      data: [],
    });
    render(
      <WordModerationPanel
        slug="evt"
        instanceId="i1"
        title="Word cloud"
        onClose={vi.fn()}
      />
    );
    expect(await screen.findByText(/aún no hay palabras/i)).toBeInTheDocument();
  });
});
