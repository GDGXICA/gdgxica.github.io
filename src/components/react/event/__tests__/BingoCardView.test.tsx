import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "__TS__"),
  getFirestore: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  useParticipantDoc: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestore: mocks.getFirestore,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  setDoc: mocks.setDoc,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../useParticipantDoc", () => ({
  useParticipantDoc: mocks.useParticipantDoc,
}));

import { BingoCardView } from "../BingoCardView";

function card(): string[] {
  return Array.from({ length: 16 }, (_, i) => `term-${i + 1}`);
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (
      typeof (m as unknown as { mockReset?: () => void }).mockReset ===
      "function"
    ) {
      (m as unknown as { mockReset: () => void }).mockReset();
    }
  }
  mocks.serverTimestamp.mockReturnValue("__TS__");
  mocks.getFirestore.mockResolvedValue({});
  mocks.doc.mockImplementation(() => ({ __ref: true }));
  mocks.setDoc.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("BingoCardView", () => {
  it("renders the 16 terms once the participant doc loads", () => {
    mocks.useParticipantDoc.mockReturnValue({
      doc: { uid: "u1", alias: "Ana", bingoCard: card() },
      loading: false,
      error: null,
    });
    render(<BingoCardView slug="x" instanceId="i" uid="u1" title="My bingo" />);
    expect(screen.getByText("My bingo")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(16);
    expect(screen.getByText("term-1")).toBeInTheDocument();
  });

  it("shows an empty-state message when the user has no card", () => {
    mocks.useParticipantDoc.mockReturnValue({
      doc: null,
      loading: false,
      error: null,
    });
    render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
    expect(screen.getByText(/no tienes un cartón/i)).toBeInTheDocument();
  });

  it("toggles a cell via setDoc with the new bingoMarked array", async () => {
    mocks.useParticipantDoc.mockReturnValue({
      doc: {
        uid: "u1",
        alias: "Ana",
        bingoCard: card(),
        bingoMarked: Array.from({ length: 16 }, () => false),
      },
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    const args = mocks.setDoc.mock.calls[0];
    const payload = args[1] as { bingoMarked: boolean[] };
    expect(payload.bingoMarked[0]).toBe(true);
    expect(payload.bingoMarked.slice(1)).toEqual(
      Array.from({ length: 15 }, () => false)
    );
  });

  it("writes bingoWonAt when a row gets completed", async () => {
    const baseMarked = Array.from({ length: 16 }, () => false);
    // Pre-mark cells 1, 2, 3 — clicking 0 completes the top row.
    baseMarked[1] = true;
    baseMarked[2] = true;
    baseMarked[3] = true;
    mocks.useParticipantDoc.mockReturnValue({
      doc: {
        uid: "u1",
        alias: "Ana",
        bingoCard: card(),
        bingoMarked: baseMarked,
      },
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
    await user.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    const payload = mocks.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.bingoWonAt).toBe("__TS__");
  });

  it("does not re-write bingoWonAt if already won", async () => {
    const winning = Array.from({ length: 16 }, (_, i) => i < 4);
    mocks.useParticipantDoc.mockReturnValue({
      doc: {
        uid: "u1",
        alias: "Ana",
        bingoCard: card(),
        bingoMarked: winning,
        bingoWonAt: { seconds: 1 },
      },
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
    // Clicking another cell while already won should still update marks
    // but NOT rewrite bingoWonAt.
    await user.click(screen.getAllByRole("button")[15]);
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    const payload = mocks.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.bingoWonAt).toBeUndefined();
  });

  it("renders the 'Bingo!' badge when the participant has won", () => {
    mocks.useParticipantDoc.mockReturnValue({
      doc: {
        uid: "u1",
        alias: "Ana",
        bingoCard: card(),
        bingoMarked: Array.from({ length: 16 }, (_, i) => i < 4),
        bingoWonAt: { seconds: 5 },
      },
      loading: false,
      error: null,
    });
    render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
    expect(screen.getByText(/¡Bingo!/i)).toBeInTheDocument();
  });
});
