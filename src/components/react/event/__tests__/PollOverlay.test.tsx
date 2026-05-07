import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "__TS__"),
  useAggregates: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestore: mocks.getFirestore,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  setDoc: mocks.setDoc,
  getDoc: mocks.getDoc,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../useAggregates", () => ({
  useAggregates: mocks.useAggregates,
}));

import { PollOverlay } from "../PollOverlay";

const CONFIG = {
  question: "¿Cuál prefieres?",
  options: [
    { id: "a", label: "Opción A" },
    { id: "b", label: "Opción B" },
  ],
};

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (
      typeof (m as unknown as { mockReset?: () => void }).mockReset ===
      "function"
    ) {
      (m as unknown as { mockReset: () => void }).mockReset();
    }
  }
  mocks.getFirestore.mockResolvedValue({});
  mocks.doc.mockImplementation(() => ({ __ref: true }));
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.serverTimestamp.mockReturnValue("__TS__");
  mocks.useAggregates.mockReturnValue({
    aggregates: null,
    loading: false,
    error: null,
  });
});

afterEach(() => cleanup());

describe("PollOverlay", () => {
  it("renders the question and clickable options", () => {
    render(
      <PollOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="Mi encuesta"
        config={CONFIG}
      />
    );
    expect(screen.getByText("Mi encuesta")).toBeInTheDocument();
    expect(screen.getByText("¿Cuál prefieres?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Opción A/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Opción B/ })
    ).toBeInTheDocument();
  });

  it("submits a vote via setDoc with the deterministic doc id", async () => {
    const user = userEvent.setup();
    render(
      <PollOverlay
        slug="evt"
        instanceId="inst"
        uid="user-1"
        alias="Ana"
        title="t"
        config={CONFIG}
      />
    );
    await user.click(screen.getByRole("button", { name: /Opción A/ }));
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    const payload = mocks.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      uid: "user-1",
      questionId: "main",
      optionId: "a",
      answeredAt: "__TS__",
    });
  });

  it("does not submit twice when the user double-taps", async () => {
    mocks.setDoc.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(undefined), 50))
    );
    const user = userEvent.setup();
    render(
      <PollOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="t"
        config={CONFIG}
      />
    );
    const btn = screen.getByRole("button", { name: /Opción A/ });
    await user.click(btn);
    await user.click(btn);
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
  });

  it("locks the UI to results once a vote is recorded", async () => {
    mocks.useAggregates.mockReturnValue({
      aggregates: {
        optionCounts: { "main:a": 3, "main:b": 1 },
        totalResponses: 4,
      },
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(
      <PollOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="t"
        config={CONFIG}
      />
    );
    await user.click(screen.getByRole("button", { name: /Opción A/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Opción B/ })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText("Tu voto")).toBeInTheDocument();
    // Result rows show counts + percentages.
    expect(screen.getByText(/3 · 75%/)).toBeInTheDocument();
    expect(screen.getByText(/1 · 25%/)).toBeInTheDocument();
  });

  it("shows results immediately if the user already voted before mount", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ optionId: "b" }),
    });
    mocks.useAggregates.mockReturnValue({
      aggregates: { optionCounts: { "main:b": 2 }, totalResponses: 2 },
      loading: false,
      error: null,
    });
    render(
      <PollOverlay
        slug="x"
        instanceId="i"
        uid="u"
        alias="Ana"
        title="t"
        config={CONFIG}
      />
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Opción A/ })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText("Tu voto")).toBeInTheDocument();
  });
});
