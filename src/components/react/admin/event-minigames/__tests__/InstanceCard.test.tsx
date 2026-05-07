import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstanceCard } from "../InstanceCard";
import type { MinigameInstance } from "../types";

afterEach(() => cleanup());

function makeInstance(
  overrides: Partial<MinigameInstance> = {}
): MinigameInstance {
  return {
    id: "i1",
    eventSlug: "ev",
    templateId: "tpl",
    templateVersion: 1,
    type: "poll",
    mode: "realtime",
    state: "scheduled",
    title: "Sample game",
    order: 0,
    ...overrides,
  };
}

describe("InstanceCard", () => {
  it("renders type, state and mode badges", () => {
    render(
      <InstanceCard
        instance={makeInstance()}
        onSetState={vi.fn()}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    expect(screen.getByText("Encuesta")).toBeInTheDocument();
    expect(screen.getByText("Programado")).toBeInTheDocument();
    expect(screen.getByText("En tiempo real")).toBeInTheDocument();
    expect(screen.getByText("Sample game")).toBeInTheDocument();
  });

  it("shows Iniciar + Eliminar in scheduled state", () => {
    render(
      <InstanceCard
        instance={makeInstance({ state: "scheduled" })}
        onSetState={vi.fn()}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    expect(
      screen.getByRole("button", { name: /Iniciar/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Eliminar/i })
    ).toBeInTheDocument();
  });

  it("calls onSetState('live') when Iniciar is clicked", () => {
    const onSetState = vi.fn();
    render(
      <InstanceCard
        instance={makeInstance({ state: "scheduled" })}
        onSetState={onSetState}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar/i }));
    expect(onSetState).toHaveBeenCalledWith("live");
  });

  it("shows Cerrar in live state for non-quiz", () => {
    render(
      <InstanceCard
        instance={makeInstance({ state: "live", type: "poll" })}
        onSetState={vi.fn()}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    expect(screen.getByRole("button", { name: /Cerrar/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Avanzar pregunta/i })
    ).not.toBeInTheDocument();
  });

  it("shows Avanzar pregunta only for live quiz", () => {
    render(
      <InstanceCard
        instance={makeInstance({
          state: "live",
          type: "quiz",
          currentQuestionIndex: 0,
          config: { questions: [{ id: "q1" }, { id: "q2" }] },
        })}
        onSetState={vi.fn()}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    const advance = screen.getByRole("button", { name: /Avanzar pregunta/i });
    expect(advance).toBeEnabled();
  });

  it("disables Avanzar pregunta on the last question", () => {
    render(
      <InstanceCard
        instance={makeInstance({
          state: "live",
          type: "quiz",
          currentQuestionIndex: 1,
          config: { questions: [{ id: "q1" }, { id: "q2" }] },
        })}
        onSetState={vi.fn()}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    expect(
      screen.getByRole("button", { name: /Avanzar pregunta/i })
    ).toBeDisabled();
  });

  it("shows Reabrir in closed state and calls onSetState('live')", () => {
    const onSetState = vi.fn();
    render(
      <InstanceCard
        instance={makeInstance({ state: "closed" })}
        onSetState={onSetState}
        onAdvanceQuiz={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Reabrir/i }));
    expect(onSetState).toHaveBeenCalledWith("live");
  });

  it("requires confirmation before delete", () => {
    const onDelete = vi.fn();
    render(
      <InstanceCard
        instance={makeInstance({ state: "scheduled" })}
        onSetState={vi.fn()}
        onAdvanceQuiz={vi.fn()}
        onDelete={onDelete}
        busy={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Eliminar/i }));
    // Now in confirm mode
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
