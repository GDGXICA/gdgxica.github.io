import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
});
