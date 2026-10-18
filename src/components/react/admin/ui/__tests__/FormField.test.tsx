import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FormField } from "../FormField";

afterEach(() => cleanup());

describe("FormField", () => {
  it("ties the label to its control", () => {
    render(
      <FormField label="Nombre del evento" required>
        <input />
      </FormField>
    );
    expect(screen.getByLabelText(/Nombre del evento/)).toBeInstanceOf(
      HTMLInputElement
    );
  });

  it("keeps an id the control already has", () => {
    render(
      <FormField label="Fecha">
        <input id="fecha-evento" />
      </FormField>
    );
    expect(screen.getByLabelText("Fecha")).toHaveAttribute(
      "id",
      "fecha-evento"
    );
  });

  it("announces the error on the control", () => {
    render(
      <FormField label="Correo" error="Falta el correo">
        <input />
      </FormField>
    );
    const input = screen.getByLabelText("Correo");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Falta el correo");
  });
});
