import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useLiveMinigames: vi.fn(),
  useAggregates: vi.fn(),
  useWordCloud: vi.fn(),
  useBingoWinners: vi.fn(),
}));

vi.mock("../useLiveMinigames", () => ({
  useLiveMinigames: mocks.useLiveMinigames,
}));
vi.mock("../useAggregates", () => ({
  useAggregates: mocks.useAggregates,
}));
vi.mock("../useWordCloud", () => ({
  useWordCloud: mocks.useWordCloud,
}));
vi.mock("../useBingoWinners", () => ({
  useBingoWinners: mocks.useBingoWinners,
}));

import { ProjectorView } from "../ProjectorView";

const QR_SVG = '<svg data-testid="qr-svg"><rect /></svg>';
const JOIN_URL = "https://gdgica.com/eventos/x?play=1";
const NOW_MS = 1_700_000_000_000;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.useLiveMinigames.mockReturnValue({
    loading: false,
    liveInstances: [],
    error: null,
  });
  mocks.useAggregates.mockReturnValue({
    aggregates: null,
    loading: false,
    error: null,
  });
  mocks.useWordCloud.mockReturnValue({
    words: [],
    loading: false,
    error: null,
  });
  mocks.useBingoWinners.mockReturnValue({
    winners: [],
    loading: false,
    error: null,
  });
});

afterEach(() => cleanup());

function renderProjector() {
  return render(
    <ProjectorView
      slug="x"
      eventName="DevFest ICA 2026"
      joinUrl={JOIN_URL}
      qrSvg={QR_SVG}
    />
  );
}

describe("ProjectorView", () => {
  it("renders the hero QR + URL when no game is live", () => {
    renderProjector();
    expect(screen.getByText("DevFest ICA 2026")).toBeInTheDocument();
    expect(screen.getByText(/Escanea para participar/i)).toBeInTheDocument();
    expect(screen.getByLabelText("QR de unión")).toBeInTheDocument();
    expect(screen.getAllByText(JOIN_URL)).not.toHaveLength(0);
  });

  it("renders an event header with the join URL on the right", () => {
    renderProjector();
    expect(screen.getByText(/GDG ICA · En vivo/)).toBeInTheDocument();
    expect(screen.getByText(/Únete escaneando el QR/)).toBeInTheDocument();
  });

  it("renders a poll instance with options and counts", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [
        {
          id: "i-poll",
          type: "poll",
          mode: "realtime",
          state: "live",
          title: "Mi poll",
          order: 0,
          config: {
            question: "¿Cuál prefieres?",
            options: [
              { id: "a", label: "Opción A" },
              { id: "b", label: "Opción B" },
            ],
          },
        },
      ],
      error: null,
    });
    mocks.useAggregates.mockReturnValue({
      aggregates: { optionCounts: { "main:a": 6, "main:b": 2 } },
      loading: false,
      error: null,
    });
    renderProjector();
    expect(screen.getByText("Mi poll")).toBeInTheDocument();
    expect(screen.getByText("¿Cuál prefieres?")).toBeInTheDocument();
    expect(screen.getByText(/6 · 75%/)).toBeInTheDocument();
    expect(screen.getByText(/2 · 25%/)).toBeInTheDocument();
  });

  it("renders a quiz instance with countdown + leaderboard", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW_MS));
    try {
      mocks.useLiveMinigames.mockReturnValue({
        loading: false,
        liveInstances: [
          {
            id: "i-quiz",
            type: "quiz",
            mode: "realtime",
            state: "live",
            title: "Mi quiz",
            order: 0,
            currentQuestionIndex: 0,
            currentQuestionStartedAt: { seconds: NOW_MS / 1000 - 10 },
            config: {
              questions: [
                {
                  id: "q1",
                  prompt: "¿Cuál es multimodal?",
                  options: [
                    { id: "a", label: "Gemini" },
                    { id: "b", label: "GPT-2" },
                  ],
                  correctOptionId: "a",
                  timeLimitSec: 30,
                  points: 100,
                },
              ],
            },
          },
        ],
        error: null,
      });
      mocks.useAggregates.mockReturnValue({
        aggregates: {
          leaderboard: [
            { uid: "u1", alias: "Ana", score: 200 },
            { uid: "u2", alias: "Bea", score: 100 },
          ],
        },
        loading: false,
        error: null,
      });
      renderProjector();
      expect(screen.getByText("¿Cuál es multimodal?")).toBeInTheDocument();
      // 30s limit - 10s elapsed = 20s remaining.
      expect(screen.getByLabelText(/Tiempo restante/)).toHaveTextContent("20s");
      expect(screen.getByText("Top 10")).toBeInTheDocument();
      expect(screen.getByText(/1\. Ana/)).toBeInTheDocument();
      expect(screen.getByText(/2\. Bea/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders a wordcloud instance with submitted words", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [
        {
          id: "i-wc",
          type: "wordcloud",
          mode: "global",
          state: "live",
          title: "Nube",
          order: 0,
          config: {
            prompt: "¿Qué te interesa?",
            maxWordsPerUser: 3,
            maxLength: 60,
          },
        },
      ],
      error: null,
    });
    mocks.useWordCloud.mockReturnValue({
      loading: false,
      error: null,
      words: [
        { id: "ai", text: "ai", normalized: "ai", count: 5 },
        { id: "ml", text: "ml", normalized: "ml", count: 2 },
      ],
    });
    renderProjector();
    expect(screen.getByText("Nube")).toBeInTheDocument();
    expect(screen.getByText("¿Qué te interesa?")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
    expect(screen.getByText("ml")).toBeInTheDocument();
  });

  it("renders a bingo instance with the winners list", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [
        {
          id: "i-bingo",
          type: "bingo",
          mode: "global",
          state: "live",
          title: "Bingo!",
          order: 0,
        },
      ],
      error: null,
    });
    mocks.useBingoWinners.mockReturnValue({
      loading: false,
      error: null,
      winners: [
        { uid: "u1", alias: "Ana", bingoWonAt: { seconds: 1700000000 } },
        { uid: "u2", alias: "Bea", bingoWonAt: { seconds: 1700000060 } },
      ],
    });
    renderProjector();
    expect(screen.getByText("Bingo!")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bea")).toBeInTheDocument();
  });

  it("shows a small QR + URL footer when there are live games", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [
        {
          id: "i-bingo",
          type: "bingo",
          mode: "global",
          state: "live",
          title: "Bingo!",
          order: 0,
        },
      ],
      error: null,
    });
    renderProjector();
    expect(screen.getByLabelText("QR para unirse")).toBeInTheDocument();
    expect(screen.getByText(/Recién llegando/i)).toBeInTheDocument();
  });

  it("renders no interactive buttons (read-only view)", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [
        {
          id: "i-poll",
          type: "poll",
          mode: "realtime",
          state: "live",
          title: "Encuesta",
          order: 0,
          config: { question: "?", options: [{ id: "a", label: "A" }] },
        },
      ],
      error: null,
    });
    renderProjector();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
