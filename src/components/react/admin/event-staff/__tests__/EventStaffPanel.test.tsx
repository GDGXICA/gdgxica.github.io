import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listEventStaff: vi.fn(),
  listUsers: vi.fn(),
  assignEventStaff: vi.fn(),
  removeEventStaff: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listEventStaff: mocks.listEventStaff,
    listUsers: mocks.listUsers,
    assignEventStaff: mocks.assignEventStaff,
    removeEventStaff: mocks.removeEventStaff,
  },
}));
vi.mock("../../AuthProvider", () => ({ useAuth: mocks.useAuth }));
vi.mock("../../useEventCatalog", () => ({
  useEventCatalog: () => ({ events: [], failed: false, retry: () => {} }),
}));

import { EventStaffPanel } from "../EventStaffPanel";

beforeEach(() => {
  window.history.replaceState({}, "", "/admin/events/staff?slug=devfest-2026");
  mocks.useAuth.mockReturnValue({ can: () => true });
  mocks.listUsers.mockResolvedValue({
    success: true,
    data: [
      {
        uid: "ext-1",
        email: "ext@mail.com",
        displayName: "Persona Externa",
        role: "volunteer",
      },
      {
        uid: "org-1",
        email: "o@mail.com",
        displayName: "Org",
        role: "organizer",
      },
    ],
  });
  mocks.listEventStaff.mockResolvedValue({
    success: true,
    data: [
      {
        uid: "ext-1",
        role: "volunteer",
        reason: "Puerta",
        permissions: ["checkin:operate", "roster:read"],
        capabilities: ["checkin"],
        active: true,
      },
      {
        uid: "old-1",
        role: "volunteer",
        reason: "Edición pasada",
        permissions: null,
        capabilities: ["checkin", "minigames", "mural", "credentials"],
        active: true,
      },
    ],
  });
  mocks.assignEventStaff.mockResolvedValue({ success: true, data: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EventStaffPanel", () => {
  it("shows what each person can do, and flags assignments made before capabilities", async () => {
    render(<EventStaffPanel />);
    const list = await screen.findByRole("region", {
      name: "Quiénes trabajan este evento",
    });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]).getByText("Check-in")).toBeInTheDocument();
    expect(within(items[0]).queryByText("Mural")).toBeNull();
    expect(
      within(items[1]).getByText("Todo (asignación anterior)")
    ).toBeInTheDocument();
  });

  it("only offers roles that work by event", async () => {
    render(<EventStaffPanel />);
    const select = await screen.findByLabelText(/Persona/);
    expect(within(select).getByText(/Persona Externa/)).toBeInTheDocument();
    expect(within(select).queryByText(/Org/)).toBeNull();
  });

  it("requires at least one capability before assigning", async () => {
    const user = userEvent.setup();
    render(<EventStaffPanel />);
    await user.selectOptions(await screen.findByLabelText(/Persona/), "ext-1");
    await user.type(screen.getByLabelText(/Motivo/), "Puerta");
    await user.click(screen.getByRole("button", { name: "Asignar" }));
    expect(
      screen.getByText("Falta al menos una capacidad.")
    ).toBeInTheDocument();
    expect(mocks.assignEventStaff).not.toHaveBeenCalled();
  });

  it("sends the chosen capabilities", async () => {
    const user = userEvent.setup();
    render(<EventStaffPanel />);
    await user.selectOptions(await screen.findByLabelText(/Persona/), "ext-1");
    await user.click(screen.getByRole("checkbox", { name: /Dinámicas/ }));
    await user.click(screen.getByRole("checkbox", { name: /Mural/ }));
    await user.type(screen.getByLabelText(/Motivo/), "Dinámicas del DevFest");
    await user.click(screen.getByRole("button", { name: "Asignar" }));
    expect(mocks.assignEventStaff).toHaveBeenCalledWith(
      "devfest-2026",
      "ext-1",
      {
        capabilities: ["minigames", "mural"],
        reason: "Dinámicas del DevFest",
        expiresAt: null,
      }
    );
  });

  it("edits an assignment starting from what it grants today", async () => {
    const user = userEvent.setup();
    render(<EventStaffPanel />);
    const list = await screen.findByRole("region", {
      name: "Quiénes trabajan este evento",
    });
    await user.click(
      within(within(list).getAllByRole("listitem")[0]).getByRole("button", {
        name: "Editar",
      })
    );
    expect(screen.getByRole("checkbox", { name: /Check-in/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Mural/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /Mural/ }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(mocks.assignEventStaff).toHaveBeenCalledWith(
      "devfest-2026",
      "ext-1",
      expect.objectContaining({ capabilities: ["checkin", "mural"] })
    );
  });

  it("hides the form from someone who cannot assign", async () => {
    mocks.useAuth.mockReturnValue({ can: () => false });
    render(<EventStaffPanel />);
    await screen.findByRole("region", { name: "Quiénes trabajan este evento" });
    expect(screen.queryByRole("button", { name: "Asignar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  });
});
