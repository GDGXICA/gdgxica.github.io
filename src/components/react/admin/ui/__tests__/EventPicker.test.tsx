import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(),
  listMyEvents: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { listEvents: mocks.listEvents, listMyEvents: mocks.listMyEvents },
}));

vi.mock("../../AuthProvider", () => ({ useAuth: mocks.useAuth }));

import { EventPicker } from "../EventPicker";

/** Quien tiene o no `events:read`, que es lo que decide la fuente. */
function signedInWith(permissions: string[]) {
  mocks.useAuth.mockReturnValue({
    can: (p: string) => permissions.includes(p),
  });
}

beforeEach(() => {
  mocks.listEvents.mockReset();
  mocks.listMyEvents.mockReset();
  mocks.useAuth.mockReset();
  mocks.listEvents.mockResolvedValue({
    success: true,
    data: [{ id: "devfest-2026", title: "DevFest Ica 2026" }],
  });
  mocks.listMyEvents.mockResolvedValue({
    success: true,
    data: [{ eventSlug: "devfest-2026", role: "volunteer", expiresAt: null }],
  });
});

afterEach(() => cleanup());

describe("EventPicker", () => {
  it("lista el catálogo cuando se puede leer eventos", async () => {
    signedInWith(["events:read", "roster:read"]);
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(await screen.findByText("DevFest Ica 2026")).toBeVisible();
    expect(mocks.listEvents).toHaveBeenCalled();
    expect(mocks.listMyEvents).not.toHaveBeenCalled();
  });

  // El caso que hace usable el rol de voluntario. `/api/events` le responde
  // 403, así que la fuente tiene que ser la otra — y elegirla por adelantado,
  // no tras fallar: cada 403 escribe un evento de seguridad en el registro.
  it("cae a los eventos asignados cuando no se pueden leer todos", async () => {
    signedInWith([]);
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(await screen.findByText("devfest-2026")).toBeVisible();
    expect(mocks.listMyEvents).toHaveBeenCalled();
    expect(mocks.listEvents).not.toHaveBeenCalled();
  });

  it("enlaza al panel con el slug puesto", async () => {
    signedInWith([]);
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    const link = await screen.findByRole("link", { name: /devfest-2026/ });
    expect(link).toHaveAttribute("href", "/admin/checkin?slug=devfest-2026");
  });

  it("escapa el slug en el enlace", async () => {
    signedInWith([]);
    mocks.listMyEvents.mockResolvedValue({
      success: true,
      data: [{ eventSlug: "a b&c", expiresAt: null }],
    });
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/admin/checkin?slug=a%20b%26c");
  });

  it("enseña hasta cuándo dura una asignación con caducidad", async () => {
    signedInWith([]);
    mocks.listMyEvents.mockResolvedValue({
      success: true,
      data: [{ eventSlug: "devfest-2026", expiresAt: "2026-08-15T00:00:00Z" }],
    });
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(await screen.findByText(/hasta el/)).toBeVisible();
  });

  // Sin asignaciones el mensaje tiene que decir qué hacer, no solo que no hay
  // nada: quien llega aquí es alguien a quien acaban de dar un rol y no sabe
  // por qué su panel está vacío.
  it("dice qué hacer cuando no hay eventos asignados", async () => {
    signedInWith([]);
    mocks.listMyEvents.mockResolvedValue({ success: true, data: [] });
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(await screen.findByText(/te asigne al evento/)).toBeVisible();
  });

  it("dice otra cosa a quien sí puede ver todos los eventos", async () => {
    signedInWith(["events:read"]);
    mocks.listEvents.mockResolvedValue({ success: true, data: [] });
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(await screen.findByText(/no hay eventos creados/)).toBeVisible();
  });

  it("enseña el error si la carga falla", async () => {
    signedInWith(["events:read"]);
    mocks.listEvents.mockResolvedValue({ success: false, error: "explotó" });
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(await screen.findByText("explotó")).toBeVisible();
  });

  it("no revienta si la petición lanza", async () => {
    signedInWith(["events:read"]);
    mocks.listEvents.mockRejectedValue(new Error("red caída"));
    render(<EventPicker basePath="/admin/checkin" title="Check-in" />);

    expect(
      await screen.findByText(/No se pudieron cargar los eventos/)
    ).toBeVisible();
  });
});
