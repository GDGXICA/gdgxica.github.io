import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listMyEvents: vi.fn(),
  listProposals: vi.fn(),
  listAccessRequests: vi.fn(),
  listPosts: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listMyEvents: mocks.listMyEvents,
    listProposals: mocks.listProposals,
    listAccessRequests: mocks.listAccessRequests,
    listPosts: mocks.listPosts,
  },
}));

vi.mock("../AuthProvider", () => ({ useAuth: mocks.useAuth }));

import { Dashboard } from "../Dashboard";

const CATALOG = [
  {
    id: "devfest-2026",
    data: {
      name: "DevFest ICA 2026",
      date: "sábado, 28 de noviembre de 2026",
      time: "09:00 AM - 01:00 PM",
      isVirtual: false,
      location: { name: "Auditorio UNICA" },
      participants: 306,
      maxParticipants: 350,
      status: { type: "upcoming" },
    },
  },
  {
    id: "devfest-2025",
    data: {
      name: "DevFest ICA 2025",
      date: "sábado, 29 de noviembre de 2025",
      time: "08:00 AM - 01:30 PM",
      isVirtual: false,
      location: { name: "Auditorio UNICA" },
      participants: 280,
      maxParticipants: 300,
      status: { type: "completed" },
    },
  },
];

function signedInAs(role: string, permissions: string[]) {
  const set = new Set(permissions);
  mocks.useAuth.mockReturnValue({
    can: (p: string) => set.has(p),
    profile: { role, status: "active" },
    permissions: set,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 18, 10));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(CATALOG)))
  );
  const slot = document.createElement("div");
  slot.id = "admin-header-actions";
  document.body.appendChild(slot);
  mocks.listMyEvents.mockResolvedValue({ success: true, data: [] });
  mocks.listProposals.mockResolvedValue({ success: true, data: [] });
  mocks.listAccessRequests.mockResolvedValue({ success: true, data: [] });
  mocks.listPosts.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  document.getElementById("admin-header-actions")?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Dashboard", () => {
  it("lleva al voluntario directo al check-in de su evento", async () => {
    signedInAs("volunteer", []);
    mocks.listMyEvents.mockResolvedValue({
      success: true,
      data: [{ eventSlug: "devfest-2026", role: "volunteer" }],
    });
    render(<Dashboard />);

    const section = await screen.findByRole("region", { name: "Tus eventos" });
    expect(await within(section).findByText("DevFest ICA 2026")).toBeVisible();
    expect(
      within(section).getByRole("link", { name: "Abrir check-in" })
    ).toHaveAttribute("href", "/admin/checkin?slug=devfest-2026");
    expect(screen.queryByRole("link", { name: "Nuevo evento" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Te esperan" })).toBeNull();
    expect(mocks.listProposals).not.toHaveBeenCalled();
  });

  it("explica qué hacer al voluntario sin asignaciones", async () => {
    signedInAs("volunteer", []);
    render(<Dashboard />);

    expect(
      await screen.findByText(/Todavía no estás asignado a ningún evento/)
    ).toBeVisible();
  });

  it("muestra al organizador los próximos eventos y lo que espera revisión", async () => {
    signedInAs("organizer", [
      "events:read",
      "events:write",
      "proposals:review",
    ]);
    mocks.listProposals.mockResolvedValue({
      success: true,
      data: [
        { status: "submitted" },
        { status: "submitted" },
        { status: "approved" },
      ],
    });
    render(<Dashboard />);

    const upcoming = await screen.findByRole("region", {
      name: "Próximos eventos",
    });
    expect(await within(upcoming).findByText("DevFest ICA 2026")).toBeVisible();
    expect(within(upcoming).queryByText("DevFest ICA 2025")).toBeNull();
    expect(screen.getByRole("link", { name: "Nuevo evento" })).toHaveAttribute(
      "href",
      "/admin/events/new"
    );

    const pending = screen.getByRole("region", { name: "Te esperan" });
    const proposals = within(pending).getByRole("link", {
      name: /Propuestas por revisar/,
    });
    expect(await within(proposals).findByText("2")).toBeVisible();
    expect(mocks.listAccessRequests).not.toHaveBeenCalled();
  });

  it("ofrece reintentar cuando no carga el calendario", async () => {
    signedInAs("organizer", ["events:read"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    vi.resetModules();
    const fresh = await import("@testing-library/react");
    const { Dashboard: FreshDashboard } = await import("../Dashboard");
    fresh.render(<FreshDashboard />);

    expect(await fresh.screen.findByRole("alert")).toHaveTextContent(
      "No se pudo cargar el calendario de eventos del sitio."
    );
    expect(
      fresh.screen.getByRole("button", { name: "Reintentar" })
    ).toBeVisible();
    fresh.cleanup();
  });
});
