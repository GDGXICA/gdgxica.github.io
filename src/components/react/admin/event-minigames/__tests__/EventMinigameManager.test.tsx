import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listEventMinigames: vi.fn(),
  attachMinigameToEvent: vi.fn(),
  setMinigameState: vi.fn(),
  advanceQuizQuestion: vi.fn(),
  removeMinigameFromEvent: vi.fn(),
  listMinigameTemplates: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listEventMinigames: mocks.listEventMinigames,
    attachMinigameToEvent: mocks.attachMinigameToEvent,
    setMinigameState: mocks.setMinigameState,
    advanceQuizQuestion: mocks.advanceQuizQuestion,
    removeMinigameFromEvent: mocks.removeMinigameFromEvent,
    listMinigameTemplates: mocks.listMinigameTemplates,
  },
}));

import { EventMinigameManager } from "../EventMinigameManager";

const SAMPLE_INSTANCES = [
  {
    id: "i1",
    eventSlug: "devfest-2025",
    templateId: "tpl-1",
    templateVersion: 1,
    type: "poll" as const,
    mode: "realtime" as const,
    state: "scheduled" as const,
    title: "First poll",
    order: 0,
  },
  {
    id: "i2",
    eventSlug: "devfest-2025",
    templateId: "tpl-2",
    templateVersion: 1,
    type: "wordcloud" as const,
    mode: "global" as const,
    state: "live" as const,
    title: "Word cloud",
    order: 1,
  },
];

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.listEventMinigames.mockResolvedValue({
    success: true,
    data: SAMPLE_INSTANCES,
  });
  mocks.listMinigameTemplates.mockResolvedValue({ success: true, data: [] });
  mocks.attachMinigameToEvent.mockResolvedValue({
    success: true,
    data: { id: "new", type: "poll" },
  });
  mocks.setMinigameState.mockResolvedValue({
    success: true,
    data: { id: "i1", state: "live" },
  });
  mocks.removeMinigameFromEvent.mockResolvedValue({ success: true });
});

afterEach(() => cleanup());

describe("EventMinigameManager", () => {
  it("renders an error if no slug is provided", () => {
    render(<EventMinigameManager />);
    expect(screen.getByText(/Falta el parámetro/i)).toBeInTheDocument();
    expect(mocks.listEventMinigames).not.toHaveBeenCalled();
  });

  it("loads instances using the slug from props", async () => {
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await waitFor(() =>
      expect(mocks.listEventMinigames).toHaveBeenCalledWith("devfest-2025")
    );
    expect(await screen.findByText("First poll")).toBeInTheDocument();
    expect(screen.getByText("Word cloud")).toBeInTheDocument();
  });

  it("calls setMinigameState when Iniciar is clicked", async () => {
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(screen.getByRole("button", { name: /Iniciar/i }));
    await waitFor(() =>
      expect(mocks.setMinigameState).toHaveBeenCalledWith(
        "devfest-2025",
        "i1",
        "live"
      )
    );
  });

  it("opens attach modal and lists only unattached templates", async () => {
    mocks.listMinigameTemplates.mockResolvedValue({
      success: true,
      data: [
        { id: "tpl-1", type: "poll", title: "Already attached" },
        { id: "tpl-3", type: "bingo", title: "Available bingo" },
      ],
    });
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(
      screen.getByRole("button", { name: /Adjuntar plantilla/i })
    );
    expect(await screen.findByText("Available bingo")).toBeInTheDocument();
    expect(screen.queryByText("Already attached")).not.toBeInTheDocument();
  });

  it("posts attach with order=instances.length when adjuntar is clicked", async () => {
    mocks.listMinigameTemplates.mockResolvedValue({
      success: true,
      data: [{ id: "tpl-3", type: "bingo", title: "Available bingo" }],
    });
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(
      screen.getByRole("button", { name: /Adjuntar plantilla/i })
    );
    await screen.findByText("Available bingo");
    await user.click(screen.getByRole("button", { name: /^Adjuntar$/i }));
    await waitFor(() =>
      expect(mocks.attachMinigameToEvent).toHaveBeenCalledWith("devfest-2025", {
        templateId: "tpl-3",
        order: 2,
      })
    );
  });
});
