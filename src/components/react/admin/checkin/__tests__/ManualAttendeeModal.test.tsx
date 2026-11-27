import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  registerManualCheckinAttendee: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    registerManualCheckinAttendee: mocks.registerManualCheckinAttendee,
  },
}));

import { ManualAttendeeModal } from "../ManualAttendeeModal";

beforeEach(() => {
  mocks.registerManualCheckinAttendee.mockReset();
});

afterEach(() => cleanup());

describe("ManualAttendeeModal", () => {
  it("submits required and optional fields and closes on Guardar", async () => {
    mocks.registerManualCheckinAttendee.mockResolvedValue({
      success: true,
      data: {
        id: "m_1",
        source: "manual",
        email: "lucia@example.com",
        checkedIn: true,
      },
    });
    const onClose = vi.fn();
    const onRegistered = vi.fn();

    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={["General Admission", "VIP"]}
        onClose={onClose}
        onRegistered={onRegistered}
        onJumpToEmail={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText(/Nombre/), "Lucía");
    await userEvent.type(screen.getByLabelText(/Apellidos/), "Quispe");
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      "lucia@example.com"
    );
    await userEvent.selectOptions(screen.getByLabelText(/Boleto/), "VIP");
    await userEvent.type(screen.getByLabelText(/DNI/), "71234567");
    await userEvent.selectOptions(
      screen.getByLabelText(/¿Cómo te enteraste/),
      "Redes sociales"
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mocks.registerManualCheckinAttendee).toHaveBeenCalledWith(
      "devfest-2026",
      {
        firstName: "Lucía",
        lastName: "Quispe",
        email: "lucia@example.com",
        ticketTitle: "VIP",
        dni: "71234567",
        heardAbout: "Redes sociales",
        checkedIn: true,
      }
    );
    expect(onRegistered).toHaveBeenCalledWith({
      fullName: "Lucía Quispe",
      email: "lucia@example.com",
      checkedIn: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open and clears inputs on Guardar y agregar más", async () => {
    mocks.registerManualCheckinAttendee.mockResolvedValue({
      success: true,
      data: {
        id: "m_1",
        source: "manual",
        email: "uno@example.com",
        checkedIn: true,
      },
    });
    const onClose = vi.fn();

    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={[]}
        onClose={onClose}
        onRegistered={vi.fn()}
        onJumpToEmail={vi.fn()}
      />
    );

    const firstNameInput = screen.getByLabelText(/Nombre/);
    await userEvent.type(firstNameInput, "Uno");
    await userEvent.type(screen.getByLabelText(/Apellidos/), "Perez");
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      "uno@example.com"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar y agregar más" })
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/1 asistente registrado/)).toBeVisible();
    expect(firstNameInput).toHaveValue("");
  });

  it("offers jumping to the existing attendee when email is duplicated", async () => {
    mocks.registerManualCheckinAttendee.mockResolvedValue({
      success: false,
      error: "Ya existe un asistente registrado con ese correo en este evento.",
      data: { existingId: "t_1" },
    });
    const onClose = vi.fn();
    const onJumpToEmail = vi.fn();

    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={[]}
        onClose={onClose}
        onRegistered={vi.fn()}
        onJumpToEmail={onJumpToEmail}
      />
    );

    await userEvent.type(screen.getByLabelText(/Nombre/), "Ana");
    await userEvent.type(screen.getByLabelText(/Apellidos/), "Flores");
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      "ana@example.com"
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const jumpBtn = await screen.findByRole("button", {
      name: /Buscar ana@example.com en la lista/,
    });
    await userEvent.click(jumpBtn);

    expect(onJumpToEmail).toHaveBeenCalledWith("ana@example.com");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("validates required fields and optional DNI format before calling API", async () => {
    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={[]}
        onClose={vi.fn()}
        onRegistered={vi.fn()}
        onJumpToEmail={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/nombre/i);
    expect(mocks.registerManualCheckinAttendee).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Nombre/), "Ana");
    await userEvent.type(screen.getByLabelText(/Apellidos/), "Flores");
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      "ana@example.com"
    );
    await userEvent.type(screen.getByLabelText(/DNI/), "12");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/DNI/i);
    expect(mocks.registerManualCheckinAttendee).not.toHaveBeenCalled();
  });

  it("prefills email, DNI, or name when opened from an empty search query", () => {
    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={[]}
        initialQuery="nuevo@example.com"
        onClose={vi.fn()}
        onRegistered={vi.fn()}
        onJumpToEmail={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue(
      "nuevo@example.com"
    );

    cleanup();
    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={[]}
        initialQuery="71234567"
        onClose={vi.fn()}
        onRegistered={vi.fn()}
        onJumpToEmail={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/DNI/)).toHaveValue("71234567");

    cleanup();
    render(
      <ManualAttendeeModal
        slug="devfest-2026"
        ticketOptions={[]}
        initialQuery="Juan Carlos Perez"
        onClose={vi.fn()}
        onRegistered={vi.fn()}
        onJumpToEmail={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("Juan");
    expect(screen.getByLabelText(/Apellidos/)).toHaveValue("Carlos Perez");
  });
});
