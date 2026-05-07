import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MinigameTemplateForm } from "../MinigameTemplateForm";
import { emptyForType, type Template } from "../types";

// jsdom doesn't ship with crypto.randomUUID in older Node lifecycles; provide
// a deterministic stub so option/question IDs render consistently.
let counter = 0;
beforeEach(() => {
  counter = 0;
  if (!globalThis.crypto) {
    (globalThis as unknown as { crypto: Crypto }).crypto = {} as Crypto;
  }
  globalThis.crypto.randomUUID = (() =>
    `id-${++counter}`) as Crypto["randomUUID"];
});

afterEach(() => {
  cleanup();
});

function renderForm(initial: Template, isEdit = false) {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  render(
    <MinigameTemplateForm
      initial={initial}
      isEdit={isEdit}
      saving={false}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
  return { onCancel, onSubmit };
}

describe("MinigameTemplateForm", () => {
  it("renders poll fields by default for a poll template", () => {
    renderForm(emptyForType("poll"));
    expect(
      screen.getByPlaceholderText(/cuál es tu opción favorita/i)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Opción 1/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Opción 2/i)).toBeInTheDocument();
  });

  it("switches to quiz fields when type changes", async () => {
    const user = userEvent.setup();
    renderForm(emptyForType("poll"));
    const select = screen.getByLabelText(/Tipo de minijuego/i);
    await user.selectOptions(select, "quiz");
    expect(screen.getByText(/Pregunta 1/)).toBeInTheDocument();
    expect(screen.getByText(/Tiempo límite/i)).toBeInTheDocument();
  });

  it("renders bingo textarea when switching to bingo", async () => {
    const user = userEvent.setup();
    renderForm(emptyForType("poll"));
    await user.selectOptions(
      screen.getByLabelText(/Tipo de minijuego/i),
      "bingo"
    );
    expect(screen.getByText(/Términos del bingo/i)).toBeInTheDocument();
    expect(screen.getByText(/0 términos detectados/i)).toBeInTheDocument();
  });

  it("blocks submit and shows error when title is empty", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(emptyForType("poll"));
    await user.click(screen.getByRole("button", { name: /Crear plantilla/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/título es obligatorio/i)).toBeInTheDocument();
  });

  it("blocks submit when poll options are missing labels", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(emptyForType("poll"));
    await user.type(
      screen.getByPlaceholderText(/Quiz de bienvenida/i),
      "Mi poll"
    );
    await user.type(
      screen.getByPlaceholderText(/cuál es tu opción favorita/i),
      "Pick"
    );
    await user.click(screen.getByRole("button", { name: /Crear plantilla/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/opciones deben tener texto/i)).toBeInTheDocument();
  });

  it("submits a valid poll payload", async () => {
    const user = userEvent.setup();
    const initial = emptyForType("poll");
    const { onSubmit } = renderForm(initial);
    await user.type(screen.getByPlaceholderText(/Quiz de bienvenida/i), "Quiz");
    await user.type(
      screen.getByPlaceholderText(/cuál es tu opción favorita/i),
      "Pick"
    );
    await user.type(screen.getByPlaceholderText(/Opción 1/i), "Yes");
    await user.type(screen.getByPlaceholderText(/Opción 2/i), "No");
    await user.click(screen.getByRole("button", { name: /Crear plantilla/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as Template;
    expect(submitted.type).toBe("poll");
    expect(submitted.title).toBe("Quiz");
    if (submitted.type === "poll") {
      expect(submitted.poll.question).toBe("Pick");
      expect(submitted.poll.options.map((o) => o.label)).toEqual(["Yes", "No"]);
    }
  });

  it("disables type selector and shows hint when editing", () => {
    const initial: Template = {
      ...emptyForType("poll"),
      id: "t1",
      title: "Existing",
      version: 2,
    };
    renderForm(initial, true);
    const select = screen.getByLabelText(
      /Tipo de minijuego/i
    ) as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(screen.getByText(/no se puede cambiar/i)).toBeInTheDocument();
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const { onCancel } = renderForm(emptyForType("wordcloud"));
    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("rejects bingo with fewer than 16 terms", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(emptyForType("bingo"));
    await user.type(
      screen.getByPlaceholderText(/Quiz de bienvenida/i),
      "Bingo"
    );
    const textarea = screen.getByPlaceholderText(
      /Un término por línea/i
    ) as HTMLTextAreaElement;
    await user.type(textarea, "alpha\nbeta\ngamma");
    await user.click(screen.getByRole("button", { name: /Crear plantilla/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/al menos 16 términos/i)).toBeInTheDocument();
  });
});
