import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useLiveMinigames: vi.fn(),
  useMinigameInstance: vi.fn(),
  useAggregates: vi.fn(),
  useWordCloud: vi.fn(),
  useBingoWinners: vi.fn(),
}));

vi.mock("../useLiveMinigames", () => ({
  useLiveMinigames: mocks.useLiveMinigames,
}));
vi.mock("../useMinigameInstance", () => ({
  useMinigameInstance: mocks.useMinigameInstance,
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

const QR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
const JOIN_URL = "https://gdgica.com/events/x/jugar";
const NOW_MS = 1_700_000_000_000;

beforeEach(() => {
  window.history.replaceState({}, "", "/events/x/projector");
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.useLiveMinigames.mockReturnValue({
    loading: false,
    liveInstances: [],
    error: null,
  });
  mocks.useMinigameInstance.mockImplementation(
    (_slug: string | null, gameId: string | null) => ({
      loading: false,
      instance:
        mocks
          .useLiveMinigames()
          .liveInstances.find((item: { id: string }) => item.id === gameId) ??
        null,
      error: null,
    })
  );
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
  const gameId = mocks.useLiveMinigames().liveInstances[0]?.id;
  if (gameId)
    window.history.replaceState({}, "", `/events/x/projector?game=${gameId}`);
  return render(
    <ProjectorView
      slug="x"
      eventName="DevFest ICA 2026"
      joinUrl={JOIN_URL}
      qrDataUrl={QR_DATA_URL}
    />
  );
}

describe("ProjectorView", () => {
  it("renders the game selector when no game is selected", () => {
    renderProjector();
    expect(screen.getByText("DevFest ICA 2026")).toBeInTheDocument();
    expect(
      screen.getByText(/Elige una dinámica para proyectar/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText(JOIN_URL)).not.toHaveLength(0);
  });

  it("renders an event header with live status", () => {
    renderProjector();
    expect(screen.getByText(/GDG ICA · En vivo/)).toBeInTheDocument();
    expect(
      screen.getByText(/Elige una dinámica para proyectar/)
    ).toBeInTheDocument();
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
    expect(screen.getByText(/¿Cuál prefieres\?/)).toBeInTheDocument();
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
          revealedAnswers: { q1: "a" },
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
      expect(screen.getByLabelText(/Tiempo restante/)).toHaveTextContent("20s");
      expect(screen.getByText("Clasificación")).toBeInTheDocument();
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
      expect(screen.getAllByText("Premio")).toHaveLength(2);
      expect(screen.getAllByText("Mención")).toHaveLength(1);
    });

    it("stays read-only — game stage contains no interactive buttons", () => {
      liveClassic({
        drawnTerms: ["Firebase", "Flutter"],
        drawCount: 2,
        lastDrawnTerm: "Flutter",
      });
      renderProjector();
      const stage = screen.getByRole("main");
      expect(within(stage).queryAllByRole("button")).toHaveLength(0);
      expect(screen.getByLabelText("Agrandar QR")).toBeInTheDocument();
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
    expect(
      screen.getByText(/¿Quieres participar\? Escanea el QR/i)
    ).toBeInTheDocument();
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
    const stage = screen.getByRole("main");
    expect(within(stage).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByLabelText("Activar sonido")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("does not spoil the roulette winner while spinning and shows final table when goal is met", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const baseInstance = {
        id: "i-roulette",
        type: "roulette",
        mode: "global",
        state: "live",
        title: "Sorteo DevFest",
        order: 0,
        spinCount: 0,
        config: { prize: "Camiseta", winnersCount: 1 },
      };
      mocks.useLiveMinigames.mockReturnValue({
        loading: false,
        liveInstances: [baseInstance],
        error: null,
      });
      mocks.useAggregates.mockReturnValue({
        aggregates: { eligibleCount: 5, winners: [] },
        loading: false,
        error: null,
      });

      const { rerender } = renderProjector();
      expect(screen.getByText(/5 participantes/)).toBeInTheDocument();

      // Admin triggers spin #1 -> backend writes winner immediately
      const spunInstance = {
        ...baseInstance,
        spinCount: 1,
        lastSpinWinnerId: "u1",
        lastSpinWinnerAlias: "Carlos",
        lastSpinAt: { seconds: 1700000010 },
      };
      mocks.useLiveMinigames.mockReturnValue({
        loading: false,
        liveInstances: [spunInstance],
        error: null,
      });
      mocks.useAggregates.mockReturnValue({
        aggregates: {
          eligibleCount: 4,
          winners: [{ uid: "u1", alias: "Carlos", spinNumber: 1 }],
        },
        loading: false,
        error: null,
      });

      rerender(
        <ProjectorView
          slug="x"
          eventName="DevFest ICA 2026"
          joinUrl={JOIN_URL}
          qrDataUrl={QR_DATA_URL}
        />
      );

      // During spin: winner MUST NOT appear anywhere on screen
      expect(screen.queryByText("Carlos")).toBeNull();
      expect(screen.getByText(/Girando ruleta/i)).toBeInTheDocument();

      // After spin finishes (4.6s): winner is revealed
      act(() => {
        vi.advanceTimersByTime(4700);
      });
      expect(screen.getAllByText("Carlos").length).toBeGreaterThan(0);

      // After celebration delay (4.5s) with winnersCount === 1: final table appears
      act(() => {
        vi.advanceTimersByTime(4600);
      });
      expect(screen.getByText(/Ganadores completos/i)).toBeInTheDocument();
      expect(screen.getByText("Carlos")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the final Top 3 podium when a quiz is closed", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.useLiveMinigames.mockReturnValue({
        loading: false,
        liveInstances: [
          {
            id: "i-quiz",
            type: "quiz",
            mode: "realtime",
            state: "closed",
            title: "Trivia Cloud",
            order: 0,
            currentQuestionIndex: 0,
            config: {
              questions: [
                {
                  id: "q1",
                  prompt: "¿?",
                  options: [{ id: "a", label: "A" }],
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
            { uid: "u1", alias: "Ana", score: 500 },
            { uid: "u2", alias: "Luis", score: 400 },
            { uid: "u3", alias: "Sofía", score: 300 },
            { uid: "u4", alias: "Diego", score: 200 },
          ],
        },
        loading: false,
        error: null,
      });

      renderProjector();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText(/Podio final/i)).toBeInTheDocument();
      expect(screen.getByText("Ana")).toBeInTheDocument();
      expect(screen.getByText("Luis")).toBeInTheDocument();
      expect(screen.getByText("Sofía")).toBeInTheDocument();
      expect(screen.getByText("Diego")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles optional stage audio on click", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [],
      error: null,
    });
    renderProjector();
    const audioBtn = screen.getByLabelText("Activar sonido");
    expect(audioBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(audioBtn);
    expect(audioBtn).toBeInTheDocument();
  });

  it("expands and closes the QR lightbox from the lobby via click, Q, and Escape", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [],
      error: null,
    });
    renderProjector();

    expect(screen.queryByRole("dialog", { name: "QR ampliado" })).toBeNull();

    fireEvent.click(screen.getByLabelText("Ampliar código QR"));
    expect(
      screen.getByRole("dialog", { name: "QR ampliado" })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "QR ampliado" })).toBeNull();

    fireEvent.keyDown(window, { key: "q" });
    expect(
      screen.getByRole("dialog", { name: "QR ampliado" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Cerrar QR grande"));
    expect(screen.queryByRole("dialog", { name: "QR ampliado" })).toBeNull();
  });

  it("uses singular grammar when a poll has exactly one response", () => {
    mocks.useLiveMinigames.mockReturnValue({
      loading: false,
      liveInstances: [
        {
          id: "i-poll-1",
          type: "poll",
          mode: "realtime",
          state: "live",
          title: "Encuesta rápida",
          order: 0,
          config: {
            question: "¿Listos?",
            options: [{ id: "a", label: "Sí" }],
          },
        },
      ],
      error: null,
    });
    mocks.useAggregates.mockReturnValue({
      aggregates: { optionCounts: { "main:a": 1 } },
      loading: false,
      error: null,
    });
    renderProjector();
    expect(screen.getByText("1 respuesta registrada")).toBeInTheDocument();
  });
});
