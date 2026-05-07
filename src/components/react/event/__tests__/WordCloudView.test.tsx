import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  increment: vi.fn((n: number) => ({ __increment: n })),
  serverTimestamp: vi.fn(() => "__TS__"),
  getFirestore: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  useWordCloud: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestore: mocks.getFirestore,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  setDoc: mocks.setDoc,
  increment: mocks.increment,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../useWordCloud", () => ({
  useWordCloud: mocks.useWordCloud,
}));

import { WordCloudView } from "../WordCloudView";

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (
      typeof (m as unknown as { mockReset?: () => void }).mockReset ===
      "function"
    ) {
      (m as unknown as { mockReset: () => void }).mockReset();
    }
  }
  mocks.increment.mockImplementation((n: number) => ({ __increment: n }));
  mocks.serverTimestamp.mockReturnValue("__TS__");
  mocks.getFirestore.mockResolvedValue({});
  mocks.doc.mockImplementation(() => ({ __ref: true }));
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.useWordCloud.mockReturnValue({
    words: [],
    loading: false,
    error: null,
  });
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => cleanup());

describe("WordCloudView", () => {
  it("renders the prompt and the empty cloud", () => {
    render(
      <WordCloudView
        slug="x"
        instanceId="i"
        uid="u"
        title="What is AI?"
        prompt="One word"
        maxWordsPerUser={3}
      />
    );
    expect(screen.getByText("What is AI?")).toBeInTheDocument();
    expect(screen.getByText("One word")).toBeInTheDocument();
    expect(screen.getByText(/sé el primero/i)).toBeInTheDocument();
  });

  it("submits a normalised word via setDoc with merge", async () => {
    const user = userEvent.setup();
    render(
      <WordCloudView
        slug="x"
        instanceId="i"
        uid="u"
        title="t"
        prompt="p"
        maxWordsPerUser={3}
      />
    );
    await user.type(screen.getByPlaceholderText(/tu palabra/i), "Hola Mundo");
    await user.click(screen.getByRole("button", { name: /Enviar/i }));
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    const [, payload, options] = mocks.setDoc.mock.calls[0];
    const data = payload as Record<string, unknown>;
    expect(data.text).toBe("Hola Mundo");
    expect(data.normalized).toBe("hola mundo");
    expect(options).toEqual({ merge: true });
  });

  it("blocks submit on profanity", async () => {
    const user = userEvent.setup();
    render(
      <WordCloudView
        slug="x"
        instanceId="i"
        uid="u"
        title="t"
        prompt="p"
        maxWordsPerUser={3}
      />
    );
    await user.type(screen.getByPlaceholderText(/tu palabra/i), "fuck");
    await user.click(screen.getByRole("button", { name: /Enviar/i }));
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/respetuosa/i);
  });

  it("does not double-submit on rapid clicks", async () => {
    mocks.setDoc.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(undefined), 50))
    );
    const user = userEvent.setup();
    render(
      <WordCloudView
        slug="x"
        instanceId="i"
        uid="u"
        title="t"
        prompt="p"
        maxWordsPerUser={3}
      />
    );
    await user.type(screen.getByPlaceholderText(/tu palabra/i), "Hola");
    const btn = screen.getByRole("button", { name: /Enviar/i });
    await user.click(btn);
    await user.click(btn);
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
  });

  it("decrements remaining count and persists in localStorage", async () => {
    const user = userEvent.setup();
    render(
      <WordCloudView
        slug="evt"
        instanceId="i1"
        uid="u"
        title="t"
        prompt="p"
        maxWordsPerUser={2}
      />
    );
    expect(screen.getByText(/te quedan/i)).toHaveTextContent("2");
    await user.type(screen.getByPlaceholderText(/tu palabra/i), "Hola");
    await user.click(screen.getByRole("button", { name: /Enviar/i }));
    await waitFor(() =>
      expect(window.localStorage.getItem("gdg_wordcloud_count_evt_i1")).toBe(
        "1"
      )
    );
    expect(screen.getByText(/te quedan/i)).toHaveTextContent("1");
  });

  it("blocks submit after the per-user limit is reached", async () => {
    window.localStorage.setItem("gdg_wordcloud_count_x_i", "3");
    const user = userEvent.setup();
    render(
      <WordCloudView
        slug="x"
        instanceId="i"
        uid="u"
        title="t"
        prompt="p"
        maxWordsPerUser={3}
      />
    );
    expect(screen.getByPlaceholderText(/tu palabra/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Enviar/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Enviar/i }));
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("renders submitted words sized by frequency", () => {
    mocks.useWordCloud.mockReturnValue({
      loading: false,
      error: null,
      words: [
        { id: "hola", text: "hola", normalized: "hola", count: 5 },
        { id: "mundo", text: "mundo", normalized: "mundo", count: 1 },
      ],
    });
    render(
      <WordCloudView
        slug="x"
        instanceId="i"
        uid="u"
        title="t"
        prompt="p"
        maxWordsPerUser={3}
      />
    );
    expect(screen.getByText("hola")).toBeInTheDocument();
    expect(screen.getByText("mundo")).toBeInTheDocument();
  });
});
