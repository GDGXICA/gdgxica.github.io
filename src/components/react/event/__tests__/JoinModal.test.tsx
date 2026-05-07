import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinModal } from "../JoinModal";
import type { LiveInstance } from "../types";

afterEach(() => cleanup());

const SAMPLE_INSTANCES: LiveInstance[] = [
  {
    id: "i1",
    type: "poll",
    mode: "realtime",
    state: "live",
    title: "Sample poll",
    order: 0,
  },
];

describe("JoinModal", () => {
  it("renders the live instance pill and the alias input", () => {
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(
      screen.getByRole("dialog", { name: /únete con un alias/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Sample poll/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ej\. ana/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the trimmed alias on click", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText(/ej\. ana/i), "  Carlos  ");
    await user.click(screen.getByRole("button", { name: /Conectarme/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("Carlos");
  });

  it("does not double-submit when the button is mashed", async () => {
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          setTimeout(() => resolve({ success: true }), 50);
        })
    );
    const user = userEvent.setup();
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText(/ej\. ana/i), "Ana");
    const button = screen.getByRole("button", { name: /Conectarme/i });
    await user.click(button);
    await user.click(button); // disabled while pending
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks submit with empty alias", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: /Conectarme/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submit with locally-detected profanity", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText(/ej\. ana/i), "fuckyou");
    await user.click(screen.getByRole("button", { name: /Conectarme/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/respetuoso/i);
  });

  it("surfaces a server error inline", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ success: false, error: "Demasiados intentos" });
    const user = userEvent.setup();
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText(/ej\. ana/i), "Ana");
    await user.click(screen.getByRole("button", { name: /Conectarme/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/demasiados/i)
    );
  });

  it("calls onDismiss when Cerrar is clicked", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <JoinModal
        liveInstances={SAMPLE_INSTANCES}
        onSubmit={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    await user.click(screen.getByRole("button", { name: /^Cerrar$/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
