import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listEventMinigames: vi.fn(),
  attachMinigameToEvent: vi.fn(),
  setMinigameState: vi.fn(),
  advanceQuizQuestion: vi.fn(),
  removeMinigameFromEvent: vi.fn(),
  listMinigameTemplates: vi.fn(),
  listEvents: vi.fn(),
  listMyEvents: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listEventMinigames: mocks.listEventMinigames,
    attachMinigameToEvent: mocks.attachMinigameToEvent,
    setMinigameState: mocks.setMinigameState,
    advanceQuizQuestion: mocks.advanceQuizQuestion,
    removeMinigameFromEvent: mocks.removeMinigameFromEvent,
    listMinigameTemplates: mocks.listMinigameTemplates,
    listEvents: mocks.listEvents,
    listMyEvents: mocks.listMyEvents,
  },
}));

// Lo usa el selector de evento que se pinta cuando no hay slug.
vi.mock("../../AuthProvider", () => ({
  useAuth: mocks.useAuth,
}));

import { EventMinigameManager } from "../EventMinigameManager";

const SAMPLE_INSTANCES = [
  {
    id: "i1",
    eventSlug: "devfest-2025",
    templateId: "tpl-1",
    templateVersion: 1,
    type: "poll" as const,
    mode: "realtime" as const,
    state: "scheduled" as const,
    title: "First poll",
    order: 0,
  },
  {
    id: "i2",
    eventSlug: "devfest-2025",
    templateId: "tpl-2",
    templateVersion: 1,
    type: "wordcloud" as const,
    mode: "global" as const,
    state: "live" as const,
    title: "Word cloud",
    order: 1,
  },
];

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.listEventMinigames.mockResolvedValue({
    success: true,
    data: SAMPLE_INSTANCES,
  });
  mocks.listMinigameTemplates.mockResolvedValue({ success: true, data: [] });
  mocks.useAuth.mockReturnValue({ can: () => true });
  mocks.listEvents.mockResolvedValue({
    success: true,
    data: [{ id: "devfest-2025", title: "DevFest 2025" }],
  });
  mocks.listMyEvents.mockResolvedValue({ success: true, data: [] });
  mocks.attachMinigameToEvent.mockResolvedValue({
    success: true,
    data: { id: "new", type: "poll" },
  });
  mocks.setMinigameState.mockResolvedValue({
    success: true,
    data: { id: "i1", state: "live" },
  });
  mocks.removeMinigameFromEvent.mockResolvedValue({ success: true });
});

afterEach(() => cleanup());

describe("EventMinigameManager", () => {
  it("ofrece elegir evento si no se dio slug", async () => {
    render(<EventMinigameManager />);
    expect(await screen.findByText(/Elige el evento/)).toBeInTheDocument();
    expect(mocks.listEventMinigames).not.toHaveBeenCalled();
  });

  it("loads instances using the slug from props", async () => {
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await waitFor(() =>
      expect(mocks.listEventMinigames).toHaveBeenCalledWith("devfest-2025")
    );
    expect(await screen.findByText("First poll")).toBeInTheDocument();
    expect(screen.getByText("Word cloud")).toBeInTheDocument();
  });

  it("calls setMinigameState when Iniciar is clicked", async () => {
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(screen.getByRole("button", { name: /Iniciar/i }));
    await waitFor(() =>
      expect(mocks.setMinigameState).toHaveBeenCalledWith(
        "devfest-2025",
        "i1",
        "live"
      )
    );
  });

  it("opens attach modal and lists only unattached templates", async () => {
    mocks.listMinigameTemplates.mockResolvedValue({
      success: true,
      data: [
        { id: "tpl-1", type: "poll", title: "Already attached" },
        { id: "tpl-3", type: "bingo", title: "Available bingo" },
      ],
    });
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(
      screen.getByRole("button", { name: /Adjuntar plantilla/i })
    );
    expect(await screen.findByText("Available bingo")).toBeInTheDocument();
    expect(screen.queryByText("Already attached")).not.toBeInTheDocument();
  });

  it("no reintenta en bucle cuando falla la carga de plantillas", async () => {
    // AttachTemplateModal lleva `onError` en las dependencias de su efecto de
    // carga. Cuando el padre lo pasaba como flecha en linea, un fallo se
    // realimentaba: onError -> setToast -> render del padre -> nueva identidad
    // de onError -> el efecto vuelve a pedir -> vuelve a fallar. En produccion
    // salieron 20 GET /api/minigame-templates en dos rafagas de ~2.5 req/s.
    mocks.listMinigameTemplates.mockResolvedValue({
      success: false,
      error: "Insufficient permissions",
    });
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(
      screen.getByRole("button", { name: /Adjuntar plantilla/i })
    );

    // El error llego al padre y lo re-renderizo, que es justo la condicion que
    // realimentaba el bucle. Sale dos veces: en el toast y en el modal.
    expect(
      (await screen.findAllByText("Insufficient permissions")).length
    ).toBeGreaterThan(0);

    // Margen para que varias vueltas del bucle se hubieran manifestado.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.listMinigameTemplates).toHaveBeenCalledTimes(1);
  });

  it("muestra el error de carga en vez del estado vacio", async () => {
    // Al quitar el bucle dejo de repetirse el toast, y el toast se desvanece
    // a los 5s. Sin un estado de error propio, lo unico que quedaba en
    // pantalla era «No hay plantillas disponibles, crea una en
    // /admin/minigame-templates»: le dice a quien acaba de recibir un 403 que
    // no existen plantillas, y lo manda a una pagina que tampoco puede abrir.
    mocks.listMinigameTemplates.mockResolvedValue({
      success: false,
      error: "Insufficient permissions",
    });
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(
      screen.getByRole("button", { name: /Adjuntar plantilla/i })
    );

    expect(
      (await screen.findAllByText("Insufficient permissions")).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/No hay plantillas disponibles/)
    ).not.toBeInTheDocument();
  });

  it("posts attach with order=instances.length when adjuntar is clicked", async () => {
    mocks.listMinigameTemplates.mockResolvedValue({
      success: true,
      data: [{ id: "tpl-3", type: "bingo", title: "Available bingo" }],
    });
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(
      screen.getByRole("button", { name: /Adjuntar plantilla/i })
    );
    await screen.findByText("Available bingo");
    await user.click(screen.getByRole("button", { name: /^Adjuntar$/i }));
    await waitFor(() =>
      expect(mocks.attachMinigameToEvent).toHaveBeenCalledWith("devfest-2025", {
        templateId: "tpl-3",
        order: 2,
      })
    );
  });

  it("opens the projector view in a new tab", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(screen.getByRole("button", { name: /Abrir proyector/i }));
    expect(openSpy).toHaveBeenCalledWith(
      "/events/devfest-2025/projector",
      "_blank"
    );
    openSpy.mockRestore();
  });

  it("copies the join URL to the clipboard", async () => {
    // userEvent.setup() installs an in-memory Clipboard, so we can read
    // back what the handler wrote without touching the real navigator.
    const user = userEvent.setup();
    render(<EventMinigameManager initialSlug="devfest-2025" />);
    await screen.findByText("First poll");
    await user.click(screen.getByRole("button", { name: /Copiar URL/i }));
    expect(await screen.findByText(/URL copiada/i)).toBeInTheDocument();
    const written = await navigator.clipboard.readText();
    expect(written).toBe("https://gdgica.com/events/devfest-2025?play=1");
  });
});
