import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "__TS__"),
  getFirestore: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  useParticipantDoc: vi.fn(),
  claimBingo: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { claimBingo: mocks.claimBingo },
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
  mocks.claimBingo.mockResolvedValue({ success: true, data: { rank: 1 } });
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

  // Regression cover for taps vanishing while a write was in flight. The
  // card lights up from the local cache echo, well before setDoc resolves
  // against the server, so a player who taps, sees blue and moves on was
  // tapping into a lock that silently dropped them.
  describe("rapid tapping", () => {
    function deferredSetDoc() {
      const resolvers: Array<() => void> = [];
      mocks.setDoc.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(() => resolve());
          })
      );
      return resolvers;
    }

    beforeEach(() => {
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
    });

    it("keeps a second tap that lands while the first write is pending", async () => {
      const resolvers = deferredSetDoc();
      const user = userEvent.setup();
      render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
      const buttons = screen.getAllByRole("button");

      await user.click(buttons[0]);
      await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
      // Still unresolved — exactly when taps used to disappear.
      await user.click(buttons[1]);
      await user.click(buttons[2]);

      // Both later taps are visible right away rather than waiting on the
      // server, and none of them is lost.
      expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
      expect(buttons[2]).toHaveAttribute("aria-pressed", "true");

      resolvers[0]();
      await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(2));
      // The queued taps are coalesced into one follow-up write carrying
      // every mark, so nothing clobbers anything.
      const second = mocks.setDoc.mock.calls[1][1] as {
        bingoMarked: boolean[];
      };
      expect(second.bingoMarked.slice(0, 3)).toEqual([true, true, true]);
    });

    it("never disables a cell just because a write is in flight", async () => {
      deferredSetDoc();
      const user = userEvent.setup();
      render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[0]);
      await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
      for (const b of buttons) expect(b).toBeEnabled();
    });

    it("rolls the card back and reports it when the write fails", async () => {
      mocks.setDoc.mockRejectedValue(new Error("sin conexión"));
      const user = userEvent.setup();
      render(<BingoCardView slug="x" instanceId="i" uid="u1" title="B" />);
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[0]);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(/sin conexión/i)
      );
      // The mark is not left showing as if it had been saved.
      expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    });
  });

  // Classic mode: an admin calls the balls, so a cell only opens once its
  // term has been called and the win goes through /bingo/claim rather
  // than a direct Firestore write.
  describe("classic mode", () => {
    const classicInstance = (drawnTerms: string[]) =>
      ({
        id: "i",
        type: "bingo",
        mode: "global",
        state: "live",
        title: "B",
        order: 0,
        config: { classic: true, prizes: 3 },
        drawnTerms,
        drawCount: drawnTerms.length,
        lastDrawnTerm: drawnTerms[drawnTerms.length - 1] ?? null,
      }) as never;

    function joined(marked: boolean[] = Array(16).fill(false), extra = {}) {
      mocks.useParticipantDoc.mockReturnValue({
        doc: {
          uid: "u1",
          alias: "Ana",
          bingoCard: card(),
          bingoMarked: marked,
          ...extra,
        },
        loading: false,
        error: null,
      });
    }

    it("shows the last ball called", () => {
      joined();
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          // "Firebase" is in the bank but not on this card, which is the
          // normal case and keeps the assertion unambiguous.
          instance={classicInstance(["term-1", "Firebase"])}
        />
      );
      expect(screen.getByText("Última bola")).toBeInTheDocument();
      expect(screen.getByText("Firebase")).toBeInTheDocument();
      expect(screen.getByText(/2 bolas cantadas/i)).toBeInTheDocument();
    });

    it("locks cells whose term has not been called", async () => {
      joined();
      const user = userEvent.setup();
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1"])}
        />
      );
      const locked = screen.getByRole("button", {
        name: /term-5 \(aún no cantado\)/i,
      });
      expect(locked).toBeDisabled();
      await user.click(locked);
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it("lets a called cell be marked", async () => {
      joined();
      const user = userEvent.setup();
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1"])}
        />
      );
      await user.click(screen.getByRole("button", { name: "term-1" }));
      await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
      const payload = mocks.setDoc.mock.calls[0][1] as Record<string, unknown>;
      expect((payload.bingoMarked as boolean[])[0]).toBe(true);
      // The win is the server's call here, never the client's.
      expect(payload.bingoWonAt).toBeUndefined();
    });

    it("never writes bingoWonAt itself, even on a completed line", async () => {
      const marked = Array(16).fill(false);
      marked[1] = marked[2] = marked[3] = true;
      joined(marked);
      const user = userEvent.setup();
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1", "term-2", "term-3", "term-4"])}
        />
      );
      await user.click(screen.getByRole("button", { name: "term-1" }));
      await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
      const payload = mocks.setDoc.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.bingoWonAt).toBeUndefined();
    });

    it("offers the BINGO button once a called line is complete", async () => {
      joined(Array.from({ length: 16 }, (_, i) => i < 4));
      const user = userEvent.setup();
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1", "term-2", "term-3", "term-4"])}
        />
      );
      const claim = screen.getByRole("button", { name: /¡BINGO!/i });
      await user.click(claim);
      await waitFor(() =>
        expect(mocks.claimBingo).toHaveBeenCalledWith("x", "i")
      );
    });

    it("hides the BINGO button when the line rests on uncalled cells", () => {
      // The card says row 0 is marked, but only two of those balls were
      // called — a leftover from an earlier state, or a tampered doc.
      joined(Array.from({ length: 16 }, (_, i) => i < 4));
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1", "term-2"])}
        />
      );
      expect(
        screen.queryByRole("button", { name: /¡BINGO!/i })
      ).not.toBeInTheDocument();
    });

    it("surfaces a rejected claim to the player", async () => {
      mocks.claimBingo.mockResolvedValue({
        success: false,
        error: "Todavía no tienes una línea completa",
      });
      joined(Array.from({ length: 16 }, (_, i) => i < 4));
      const user = userEvent.setup();
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1", "term-2", "term-3", "term-4"])}
        />
      );
      await user.click(screen.getByRole("button", { name: /¡BINGO!/i }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(/línea completa/i)
      );
    });

    it("shows the placing and prize status once crowned", () => {
      joined(
        Array.from({ length: 16 }, (_, i) => i < 4),
        {
          bingoWonAt: { seconds: 9 },
          bingoRank: 2,
        }
      );
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1", "term-2", "term-3", "term-4"])}
        />
      );
      expect(screen.getByText(/Puesto 2 · premio/i)).toBeInTheDocument();
      // Already won — no second claim to make.
      expect(
        screen.queryByRole("button", { name: /¡BINGO!/i })
      ).not.toBeInTheDocument();
    });

    it("labels a winner past the prize count as a mention", () => {
      joined(
        Array.from({ length: 16 }, (_, i) => i < 4),
        {
          bingoWonAt: { seconds: 9 },
          bingoRank: 5,
        }
      );
      render(
        <BingoCardView
          slug="x"
          instanceId="i"
          uid="u1"
          title="B"
          instance={classicInstance(["term-1", "term-2", "term-3", "term-4"])}
        />
      );
      expect(screen.getByText(/Puesto 5/i)).toBeInTheDocument();
      expect(screen.queryByText(/premio/i)).not.toBeInTheDocument();
    });
  });
});
