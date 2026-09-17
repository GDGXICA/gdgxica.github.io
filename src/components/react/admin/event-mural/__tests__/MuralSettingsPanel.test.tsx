import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MuralSettingsPanel } from "../MuralSettingsPanel";
import type { MuralSettings } from "@/lib/mural";

afterEach(cleanup);

function settingsOf(over: Partial<MuralSettings> = {}): MuralSettings {
  return {
    state: "open",
    maxPerUid: 10,
    maxTotal: 1500,
    acceptedTotal: 0,
    headline: "Sube tus fotos",
    ...over,
  };
}

const headlineField = () => screen.getByPlaceholderText(/sube tus fotos del/i);
const totalField = () => screen.getByLabelText(/total del evento/i);
const perPersonField = () => screen.getByLabelText(/fotos por persona/i);
const saveButton = () => screen.getByRole("button", { name: /guardar/i });

describe("MuralSettingsPanel", () => {
  /**
   * Con el mural abierto, acceptedTotal sube con CADA subida, así que el
   * documento de ajustes cambia constantemente. Si el formulario se
   * resincronizara con cada snapshot, borraría lo que el moderador está
   * escribiendo en mitad de la frase.
   */
  it("un contador que sube NO borra lo que se está tecleando", async () => {
    const { rerender } = render(
      <MuralSettingsPanel
        settings={settingsOf({ acceptedTotal: 10 })}
        saving={false}
        onSave={vi.fn()}
      />
    );

    await userEvent.clear(headlineField());
    await userEvent.type(headlineField(), "Fotos del DevFest");

    rerender(
      <MuralSettingsPanel
        settings={settingsOf({ acceptedTotal: 11 })}
        saving={false}
        onSave={vi.fn()}
      />
    );

    expect(headlineField()).toHaveValue("Fotos del DevFest");
  });

  it("tampoco pisa los topes a medio editar", async () => {
    const { rerender } = render(
      <MuralSettingsPanel
        settings={settingsOf({ acceptedTotal: 1 })}
        saving={false}
        onSave={vi.fn()}
      />
    );

    await userEvent.clear(totalField());
    await userEvent.type(totalField(), "900");

    rerender(
      <MuralSettingsPanel
        settings={settingsOf({ acceptedTotal: 2 })}
        saving={false}
        onSave={vi.fn()}
      />
    );

    expect(totalField()).toHaveValue(900);
  });

  it("sí se resincroniza cuando otro moderador cambia un ajuste de verdad", () => {
    const { rerender } = render(
      <MuralSettingsPanel
        settings={settingsOf({ headline: "Antiguo" })}
        saving={false}
        onSave={vi.fn()}
      />
    );

    rerender(
      <MuralSettingsPanel
        settings={settingsOf({ headline: "Cambiado por otro" })}
        saving={false}
        onSave={vi.fn()}
      />
    );

    expect(headlineField()).toHaveValue("Cambiado por otro");
  });

  describe("validación de los topes", () => {
    it("un campo vacío no deja guardar, en vez de mandar NaN", async () => {
      render(
        <MuralSettingsPanel
          settings={settingsOf()}
          saving={false}
          onSave={vi.fn()}
        />
      );

      await userEvent.clear(perPersonField());
      expect(saveButton()).toBeDisabled();
    });

    it("un valor fuera de rango tampoco", async () => {
      render(
        <MuralSettingsPanel
          settings={settingsOf()}
          saving={false}
          onSave={vi.fn()}
        />
      );

      await userEvent.clear(totalField());
      await userEvent.type(totalField(), "99999");
      expect(saveButton()).toBeDisabled();
    });

    it("con valores válidos guarda lo que se ve", async () => {
      const onSave = vi.fn();
      render(
        <MuralSettingsPanel
          settings={settingsOf()}
          saving={false}
          onSave={onSave}
        />
      );

      await userEvent.clear(perPersonField());
      await userEvent.type(perPersonField(), "5");
      await userEvent.click(saveButton());

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ maxPerUid: 5, maxTotal: 1500 })
      );
    });
  });
});
