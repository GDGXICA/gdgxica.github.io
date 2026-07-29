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
const JOIN_URL = "https://gdgica.com/events/x?play=1";
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
    // Conference mode has no ball count, so no prize/mention split.
    expect(screen.queryByText(/Premio/i)).not.toBeInTheDocument();
  });

  describe("classic bingo", () => {
    function liveClassic(overrides: Record<string, unknown> = {}) {
      mocks.useLiveMinigames.mockReturnValue({
        loading: false,
        liveInstances: [
          {
            id: "i-bingo",
            type: "bingo",
            mode: "global",
            state: "live",
            title: "Bingo de tecnologías",
            order: 0,
            config: {
              classic: true,
              prizes: 2,
              terms: Array.from({ length: 40 }, (_, i) => `t${i}`),
            },
            drawnTerms: [],
            drawCount: 0,
            lastDrawnTerm: null,
            ...overrides,
          },
        ],
        error: null,
      });
    }

    it("idles with tumbling balls before the first is called", () => {
      liveClassic();
      renderProjector();
      expect(screen.getByText("Bingo de tecnologías")).toBeInTheDocument();
      // The badge names the mode, separately from the instance title.
      expect(screen.getByText("Bingo clásico")).toBeInTheDocument();
      expect(
        screen.getByText(/Esperando la primera bola/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/0 \/ 40 bolas/)).toBeInTheDocument();
    });

    it("shows the ball just called, and the earlier ones behind it", () => {
      liveClassic({
        drawnTerms: ["Firebase", "Flutter", "Gemini"],
        drawCount: 3,
        lastDrawnTerm: "Gemini",
        lastDrawAt: { seconds: 1700000200 },
      });
      renderProjector();
      expect(screen.getByText("Gemini")).toBeInTheDocument();
      expect(screen.getByText("Firebase")).toBeInTheDocument();
      expect(screen.getByText("Flutter")).toBeInTheDocument();
      expect(screen.getByText(/Ya cantadas/i)).toBeInTheDocument();
      expect(screen.getByText(/3 \/ 40 bolas/)).toBeInTheDocument();
    });

    it("replays the drop animation on the newly called ball", () => {
      liveClassic({
        drawnTerms: ["Firebase"],
        drawCount: 1,
        lastDrawnTerm: "Firebase",
        lastDrawAt: { seconds: 1700000100 },
      });
      renderProjector();
      const ball = screen.getByText("Firebase").parentElement;
      expect(ball?.className).toContain("animate-bingo-ball-drop");
    });

    it("splits winners into prizes and mentions", () => {
      liveClassic({ drawnTerms: ["a"], drawCount: 1, lastDrawnTerm: "a" });
      mocks.useBingoWinners.mockReturnValue({
        loading: false,
        error: null,
        winners: [
          { uid: "u1", alias: "Ana", bingoWonAt: { seconds: 1700000000 } },
          { uid: "u2", alias: "Bea", bingoWonAt: { seconds: 1700000060 } },
          { uid: "u3", alias: "Cid", bingoWonAt: { seconds: 1700000120 } },
        ],
      });
      renderProjector();
      // prizes: 2 → first two are prizes, the third a mention.
      expect(screen.getAllByText("Premio")).toHaveLength(2);
      expect(screen.getAllByText("Mención")).toHaveLength(1);
    });

    it("stays read-only — the presenter's QR toggle is the only button", () => {
      liveClassic({
        drawnTerms: ["Firebase", "Flutter"],
        drawCount: 2,
        lastDrawnTerm: "Flutter",
      });
      renderProjector();
      const buttons = screen.queryAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAttribute("aria-label", "Agrandar QR");
    });
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
    expect(screen.getByLabelText("Agrandar QR")).toBeInTheDocument();
    expect(screen.getByText(/Recién llegando/i)).toBeInTheDocument();
  });

  it("renders no interactive buttons in game content (read-only view)", () => {
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
    // The only button allowed in the projector is the QR toggle (presenter
    // control). Game content itself must not render interactive elements.
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("aria-label", "Agrandar QR");
  });
});
