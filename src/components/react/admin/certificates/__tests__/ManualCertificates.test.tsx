import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  listEvents: vi.fn(),
  getCertificateSettings: vi.fn(),
  listManualCertificates: vi.fn(),
  createManualCertificates: vi.fn(),
  previewCertificate: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api }));

import { ManualCertificates } from "../ManualCertificates";

const SETTINGS = {
  eventName: "Taller de Cloud",
  eventDate: "2026-10-04",
  startTime: "15:00",
  endTime: "18:00",
  hours: 3,
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.listEvents.mockResolvedValue({
    success: true,
    data: [{ id: "taller-cloud", title: "Taller de Cloud" }],
  });
  api.getCertificateSettings.mockResolvedValue({
    success: true,
    data: { settings: SETTINGS, settingsSaved: true },
  });
  api.listManualCertificates.mockResolvedValue({
    success: true,
    data: { serverTime: 1, items: [] },
  });
});

afterEach(() => cleanup());

async function fillForm() {
  await userEvent.selectOptions(
    await screen.findByLabelText("Tomar los datos de"),
    "taller-cloud"
  );
  await waitFor(() =>
    expect(screen.getByLabelText(/Nombre del evento/)).toHaveValue(
      "Taller de Cloud"
    )
  );
  await userEvent.type(screen.getByLabelText("Nombres, fila 1"), "Pedro");
  await userEvent.type(screen.getByLabelText("Apellidos, fila 1"), "Gómez");
  await userEvent.type(screen.getByLabelText("Correo, fila 1"), "pedro@x.com");
}

describe("ManualCertificates", () => {
  it("marks the bad row and sends nothing", async () => {
    render(<ManualCertificates />);
    await fillForm();
    await userEvent.type(screen.getByLabelText("Nombres, fila 2"), "Lucía");
    await userEvent.type(screen.getByLabelText("Correo, fila 2"), "josé@x.com");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar 2 certificados" })
    );
    expect(screen.getByText("Este correo no es válido.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sí, enviar/ })).toBeNull();
    expect(api.createManualCertificates).not.toHaveBeenCalled();
  });

  it("sends after confirming, with the event data and a stable submission id", async () => {
    api.createManualCertificates
      .mockResolvedValueOnce({ success: false, error: "Error 504" })
      .mockResolvedValueOnce({
        success: true,
        data: { queued: 1, existing: 0, duplicates: 0 },
      });
    render(<ManualCertificates />);
    await fillForm();

    const confirmAndSend = async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Enviar 1 certificado" })
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Sí, enviar 1 certificado" })
      );
    };
    await confirmAndSend();
    expect(await screen.findByText("Error 504")).toBeInTheDocument();
    await confirmAndSend();

    const [first, second] = api.createManualCertificates.mock.calls.map(
      (c) => c[0]
    );
    expect(first).toEqual({
      submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: "attendee",
      eventSlug: "taller-cloud",
      content: SETTINGS,
      recipients: [
        { firstName: "Pedro", lastName: "Gómez", email: "pedro@x.com" },
      ],
    });
    // A retry after a timeout must not queue the same people twice.
    expect(second.submissionId).toBe(first.submissionId);
    expect(
      await screen.findByText(/1 certificado en camino/)
    ).toBeInTheDocument();
  });

  it("points at the row the server rejected", async () => {
    api.createManualCertificates.mockResolvedValue({
      success: false,
      error: "Invalid request body",
      issues: [{ path: "recipients.0.email", message: "Invalid email" }],
    });
    render(<ManualCertificates />);
    await fillForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar 1 certificado" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Sí, enviar 1 certificado" })
    );
    expect(
      await screen.findByText("El servidor rechazó este correo.")
    ).toBeInTheDocument();
  });

  it("does not ask for hours on a speaker certificate", async () => {
    api.getCertificateSettings.mockResolvedValue({
      success: true,
      data: { settings: { ...SETTINGS, hours: 0 }, settingsSaved: false },
    });
    api.createManualCertificates.mockResolvedValue({
      success: true,
      data: { queued: 1, existing: 0, duplicates: 0 },
    });
    render(<ManualCertificates />);
    await userEvent.click(await screen.findByLabelText(/Speakers/));
    await fillForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar 1 certificado" })
    );
    expect(
      screen.getByRole("button", { name: "Sí, enviar 1 certificado" })
    ).toBeInTheDocument();
  });
});
