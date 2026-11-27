import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useParticipantDoc: vi.fn(),
  useAggregates: vi.fn(),
}));

vi.mock("../useParticipantDoc", () => ({
  useParticipantDoc: mocks.useParticipantDoc,
}));
vi.mock("../useAggregates", () => ({
  useAggregates: mocks.useAggregates,
}));

import { RouletteView } from "../RouletteView";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useParticipantDoc.mockReturnValue({
    doc: { uid: "u1", alias: "Ana" },
    loading: false,
    error: null,
  });
  mocks.useAggregates.mockReturnValue({
    aggregates: {
      eligibleCount: 42,
      winners: [{ uid: "u2", alias: "Luis", spinNumber: 1 }],
    },
    loading: false,
    error: null,
  });
});

afterEach(() => cleanup());

describe("RouletteView", () => {
  it("renders counts and winners from aggregates without subscribing to all participants", () => {
    render(
      <RouletteView
        slug="evt"
        instanceId="r1"
        uid="u1"
        title="Ruleta final"
        instance={{
          id: "r1",
          type: "roulette",
          mode: "global",
          state: "live",
          title: "Ruleta final",
          order: 0,
          config: { prize: "Camiseta" },
        }}
      />
    );
    expect(screen.getByText("Estás en la ruleta")).toBeInTheDocument();
    expect(screen.getByText(/42 participantes elegibles/)).toBeInTheDocument();
    expect(screen.getByText(/1 ganador/)).toBeInTheDocument();
    expect(screen.getByText("Luis")).toBeInTheDocument();
  });

  it("announces win immediately from participant doc", () => {
    mocks.useParticipantDoc.mockReturnValue({
      doc: { uid: "u1", alias: "Ana", rouletteWonAt: { seconds: 100 } },
      loading: false,
      error: null,
    });
    render(
      <RouletteView
        slug="evt"
        instanceId="r1"
        uid="u1"
        title="Ruleta final"
        instance={{
          id: "r1",
          type: "roulette",
          mode: "global",
          state: "live",
          title: "Ruleta final",
          order: 0,
        }}
      />
    );
    expect(screen.getByText("¡Ganaste!")).toBeInTheDocument();
  });

  it("delays revealing a live win until the projector spin finishes", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.useAggregates.mockReturnValue({
        aggregates: { eligibleCount: 10, winners: [] },
        loading: false,
        error: null,
      });

      const base = {
        id: "r1",
        type: "roulette" as const,
        mode: "global" as const,
        state: "live" as const,
        title: "Ruleta final",
        order: 0,
        spinCount: 0,
        config: { prize: "Camiseta", winnersCount: 2 },
      };

      const { rerender } = render(
        <RouletteView
          slug="evt"
          instanceId="r1"
          uid="u1"
          title="Ruleta final"
          instance={base}
        />
      );
      expect(screen.getByText("Estás en la ruleta")).toBeInTheDocument();

      // Spin 1 selects u1 immediately on backend
      mocks.useParticipantDoc.mockReturnValue({
        doc: {
          uid: "u1",
          alias: "Ana",
          rouletteWonAt: { seconds: 100 },
          rouletteSpinNumber: 1,
        },
        loading: false,
        error: null,
      });
      mocks.useAggregates.mockReturnValue({
        aggregates: {
          eligibleCount: 9,
          winners: [{ uid: "u1", alias: "Ana", spinNumber: 1 }],
        },
        loading: false,
        error: null,
      });

      rerender(
        <RouletteView
          slug="evt"
          instanceId="r1"
          uid="u1"
          title="Ruleta final"
          instance={{
            ...base,
            spinCount: 1,
            lastSpinWinnerId: "u1",
            lastSpinWinnerAlias: "Ana",
          }}
        />
      );

      // Must show spinning state instead of spoiling "¡Ganaste!"
      expect(screen.getByText(/La ruleta está girando/i)).toBeInTheDocument();
      expect(screen.queryByText("¡Ganaste!")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(4700);
      });
      expect(screen.getByText("¡Ganaste!")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
