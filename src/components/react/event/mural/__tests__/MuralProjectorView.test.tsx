import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { MuralPhoto, MuralSettings } from "@/lib/mural";

const mocks = vi.hoisted(() => ({
  photos: {
    photos: [] as unknown[],
    loading: false,
    synced: true,
    error: null,
  },
  settings: {
    settings: {
      state: "open",
      maxPerUid: 10,
      maxTotal: 1500,
      acceptedTotal: 0,
      headline: "",
    } as unknown,
    loading: false,
  },
  loadImage: vi.fn(),
  reducedMotion: false,
}));

vi.mock("../useApprovedMuralPhotos", () => ({
  useApprovedMuralPhotos: () => mocks.photos,
}));

vi.mock("../useMuralSettings", () => ({
  useMuralSettings: () => mocks.settings,
}));

vi.mock("../loadImage", () => ({
  loadImage: mocks.loadImage,
}));

import { MuralProjectorView } from "../MuralProjectorView";

const QR = "data:image/png;base64,AAAA";
const QR_ALT = "QR para subir fotos al mural";

function photo(id: string, alias = ""): MuralPhoto {
  return {
    id,
    eventSlug: "devfest",
    status: "approved",
    uid: `u-${id}`,
    alias,
    storagePath: null,
    downloadUrl: `https://fotos.test/${id}.jpg`,
    width: 1600,
    height: 1200,
    bytes: 1000,
    createdAt: null,
    approvedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: "",
    removalRequestedAt: null,
    removalRequestNote: "",
    removedReason: null,
  };
}

function many(count: number): MuralPhoto[] {
  return Array.from({ length: count }, (_, i) => photo(`p${i}`));
}

function setPhotos(list: MuralPhoto[], loading = false, synced = true) {
  mocks.photos = { photos: list, loading, synced, error: null };
}

function setSettings(patch: Partial<MuralSettings>, loading = false) {
  mocks.settings = {
    settings: {
      state: "open",
      maxPerUid: 10,
      maxTotal: 1500,
      acceptedTotal: 0,
      headline: "",
      ...patch,
    },
    loading,
  };
}

function view() {
  return (
    <MuralProjectorView
      slug="devfest"
      eventName="DevFest 2025"
      headline="Comparte tus fotos"
      uploadUrl="https://gdgica.com/events/devfest/subir"
      qrDataUrl={QR}
    />
  );
}

function tile(id: string) {
  return document.querySelector(`[data-photo-id="${id}"]`);
}

const animations: ReturnType<typeof fakeAnimation>[] = [];

const fakeAnimation = () => ({
  currentTime: 0 as number | null,
  effect: { setKeyframes: vi.fn(), updateTiming: vi.fn() },
  cancel: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
});

beforeEach(() => {
  setPhotos([]);
  setSettings({});
  mocks.reducedMotion = false;
  mocks.loadImage.mockReset();
  mocks.loadImage.mockResolvedValue({ width: 1600, height: 1200 });

  window.matchMedia = vi.fn(() => ({
    matches: mocks.reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  animations.length = 0;
  Element.prototype.animate = vi.fn(() => {
    const animation = fakeAnimation();
    animations.push(animation);
    return animation;
  }) as unknown as typeof Element.prototype.animate;

  Object.defineProperty(document, "fullscreenElement", {
    value: null,
    configurable: true,
  });
  document.documentElement.requestFullscreen = vi.fn(async () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  document.exitFullscreen = vi.fn(async () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MuralProjectorView: titular e invitación", () => {
  it("usa el titular de los Ajustes en vivo", () => {
    setSettings({ headline: "Fotos del DevFest en vivo" });
    render(view());
    expect(screen.getByRole("heading")).toHaveTextContent(
      "Fotos del DevFest en vivo"
    );
  });

  it("sin titular en Ajustes cae al del evento y luego al nombre", () => {
    const { unmount } = render(view());
    expect(screen.getByRole("heading")).toHaveTextContent("Comparte tus fotos");
    unmount();
    render(
      <MuralProjectorView
        slug="devfest"
        eventName="DevFest 2025"
        headline=""
        uploadUrl="https://gdgica.com/events/devfest/subir"
        qrDataUrl={QR}
      />
    );
    expect(screen.getByRole("heading")).toHaveTextContent("DevFest 2025");
  });

  it("abierto invita a subir con el QR y el enlace", async () => {
    setPhotos([photo("a")]);
    render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());
    expect(screen.getByAltText(QR_ALT)).toBeInTheDocument();
    expect(
      screen.getByText("gdgica.com/events/devfest/subir")
    ).toBeInTheDocument();
  });

  it("en pausa lo avisa sin mostrar el QR", async () => {
    setPhotos([photo("a")]);
    setSettings({ state: "paused" });
    render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());
    expect(screen.queryByAltText(QR_ALT)).toBeNull();
    expect(screen.getByText("Subidas en pausa")).toBeInTheDocument();
  });

  it("cerrado no invita a subir", async () => {
    setPhotos([photo("a")]);
    setSettings({ state: "closed" });
    render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());
    expect(screen.queryByAltText(QR_ALT)).toBeNull();
    expect(screen.queryByText("Sube tu foto")).toBeNull();
  });

  it("mientras cargan los Ajustes no enseña el QR", async () => {
    setPhotos([photo("a")]);
    setSettings({}, true);
    render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());
    expect(screen.queryByAltText(QR_ALT)).toBeNull();
  });

  it("sin fotos y abierto muestra el QR grande", () => {
    render(view());
    expect(
      screen.getByText("Escanea y sube tu primera foto")
    ).toBeInTheDocument();
    expect(screen.getByAltText(QR_ALT)).toBeInTheDocument();
  });
});

describe("MuralProjectorView: fotos", () => {
  it("no pinta una foto hasta que su imagen cargó", async () => {
    let finish: (size: { width: number; height: number }) => void = () => {};
    mocks.loadImage.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );
    setPhotos([photo("a")]);
    render(view());
    expect(tile("a")).toBeNull();

    await act(async () => finish({ width: 1600, height: 1200 }));

    await waitFor(() => expect(tile("a")).not.toBeNull());
  });

  it("descarta las fotos cuya imagen no carga", async () => {
    mocks.loadImage.mockImplementation((url: string) =>
      url.includes("rota")
        ? Promise.reject(new Error("404"))
        : Promise.resolve({ width: 1600, height: 1200 })
    );
    setPhotos([photo("rota"), photo("buena")]);
    render(view());
    await waitFor(() => expect(tile("buena")).not.toBeNull());
    expect(tile("rota")).toBeNull();
  });

  it("muestra el nombre solo en las fotos que lo tienen", async () => {
    setPhotos([photo("a", "Ana"), photo("b", "")]);
    render(view());
    await waitFor(() => expect(tile("b")).not.toBeNull());
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(tile("b")?.querySelector("figcaption")).toBeNull();
  });

  it("con pocas fotos también hay columnas en movimiento", async () => {
    setPhotos([photo("a"), photo("b"), photo("c")]);
    render(view());
    await waitFor(() =>
      expect(document.querySelector('[data-mode="ribbons"]')).not.toBeNull()
    );
    expect(Element.prototype.animate).toHaveBeenCalled();
    expect(document.querySelector('[data-mode="static"]')).toBeNull();
  });

  it("el titular y el QR van sobre las fotos, sin quitarles alto", async () => {
    setPhotos(many(6));
    render(view());
    await waitFor(() =>
      expect(document.querySelector('[data-mode="ribbons"]')).not.toBeNull()
    );
    const header = screen.getByRole("banner");
    const footer = screen.getByRole("contentinfo");
    expect(header).toHaveClass("absolute");
    expect(footer).toHaveClass("absolute");
    expect(footer).toContainElement(screen.getByAltText(QR_ALT));
    const wall = document.querySelector("main") as HTMLElement;
    expect(wall).toHaveClass("absolute", "inset-0");
  });

  it("con muchas fotos las pone en cintas animadas", async () => {
    setPhotos(many(30));
    render(view());
    await waitFor(() =>
      expect(document.querySelector('[data-mode="ribbons"]')).not.toBeNull()
    );
    expect(Element.prototype.animate).toHaveBeenCalled();
  });

  it("con movimiento reducido deja quietas las fotos más nuevas", async () => {
    mocks.reducedMotion = true;
    setPhotos(many(30));
    render(view());
    await waitFor(() =>
      expect(document.querySelector('[data-mode="static"]')).not.toBeNull()
    );
    expect(tile("p0")).not.toBeNull();
    expect(tile("p29")).toBeNull();
    expect(Element.prototype.animate).not.toHaveBeenCalled();
  });

  it("si ninguna imagen carga, no se queda en «Cargando fotos…»", async () => {
    mocks.loadImage.mockRejectedValue(new Error("404"));
    setPhotos([photo("a"), photo("b")]);
    render(view());
    expect(
      await screen.findByText("Escanea y sube tu primera foto")
    ).toBeInTheDocument();
    expect(screen.queryByText("Cargando fotos…")).toBeNull();
  });

  it("en filas quietas, una baja no hace parpadear toda la pared", async () => {
    mocks.reducedMotion = true;
    setPhotos([photo("a"), photo("b"), photo("c")]);
    const { rerender } = render(view());
    await waitFor(() => expect(tile("c")).not.toBeNull());
    const wall = document.querySelector("[data-epoch]") as HTMLElement;
    const epoch = wall.dataset.epoch;
    const before = { a: tile("a"), b: tile("b") };

    setPhotos([photo("a"), photo("b")]);
    rerender(view());

    await waitFor(() => expect(tile("c")).toBeNull());
    expect(wall.dataset.epoch).toBe(epoch);
    for (const id of ["a", "b"] as const) {
      const after = tile(id);
      if (after !== before[id]) {
        expect(after).not.toHaveClass("animate-mural-tile-in");
      }
    }
  });
});

describe("MuralProjectorView: foto destacada", () => {
  it("lo que ya estaba al abrir no se destaca", async () => {
    setPhotos([photo("a"), photo("b")]);
    render(view());
    await waitFor(() => expect(tile("b")).not.toBeNull());
    expect(screen.queryByTestId("mural-spotlight")).toBeNull();
  });

  it("una foto recién aprobada sale en grande y luego pasa al mural", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setPhotos([photo("a")]);
    const { rerender } = render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());

    setPhotos([photo("nueva", "Lucía"), photo("a")]);
    rerender(view());

    const spotlight = await screen.findByTestId("mural-spotlight");
    expect(spotlight).toHaveTextContent("Lucía");
    expect(tile("nueva")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(6500);
    });

    await waitFor(() =>
      expect(screen.queryByTestId("mural-spotlight")).toBeNull()
    );
    await waitFor(() => expect(tile("nueva")).not.toBeNull());
  });

  it("las cintas se detienen mientras se ve la foto destacada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setPhotos(many(30));
    const { rerender } = render(view());
    await waitFor(() => expect(animations.length).toBeGreaterThan(0));

    setPhotos([photo("nueva"), ...many(30)]);
    rerender(view());
    await screen.findByTestId("mural-spotlight");
    await waitFor(() =>
      animations.forEach((a) => expect(a.pause).toHaveBeenCalled())
    );

    await act(async () => {
      vi.advanceTimersByTime(6500);
    });
    await waitFor(() =>
      expect(screen.queryByTestId("mural-spotlight")).toBeNull()
    );
    animations.forEach((a) =>
      expect(a.play.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
        a.pause.mock.invocationCallOrder.at(-1) ?? 0
      )
    );
  });

  it("lo que llega antes de sincronizar con el servidor no se destaca", async () => {
    setPhotos([photo("a")], false, false);
    const { rerender } = render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());

    setPhotos([photo("b"), photo("a")]);
    rerender(view());
    await waitFor(() => expect(tile("b")).not.toBeNull());
    expect(screen.queryByTestId("mural-spotlight")).toBeNull();

    setPhotos([photo("c", "Carla"), photo("b"), photo("a")]);
    rerender(view());
    expect(await screen.findByTestId("mural-spotlight")).toHaveTextContent(
      "Carla"
    );
  });

  it("una foto retirada mientras carga no ocupa el turno de la siguiente", async () => {
    const finish = new Map<
      string,
      (size: { width: number; height: number }) => void
    >();
    mocks.loadImage.mockImplementation((url: string) =>
      url.includes("/a.")
        ? Promise.resolve({ width: 1600, height: 1200 })
        : new Promise((resolve) => finish.set(url, resolve))
    );
    setPhotos([photo("a")]);
    const { rerender } = render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());

    setPhotos([photo("w", "Wendy"), photo("x"), photo("a")]);
    rerender(view());
    setPhotos([photo("w", "Wendy"), photo("a")]);
    rerender(view());

    await act(async () =>
      finish.get("https://fotos.test/x.jpg")?.({ width: 1600, height: 1200 })
    );
    await act(async () =>
      finish.get("https://fotos.test/w.jpg")?.({ width: 1600, height: 1200 })
    );

    expect(await screen.findByTestId("mural-spotlight")).toHaveTextContent(
      "Wendy"
    );
  });

  it("si el mural estaba vacío, la primera foto también se destaca", async () => {
    const { rerender } = render(view());
    setPhotos([photo("primera")]);
    rerender(view());
    expect(await screen.findByTestId("mural-spotlight")).toBeInTheDocument();
  });
});

describe("MuralProjectorView: pantalla completa", () => {
  it("la tecla f pide pantalla completa y deja solo las fotos", async () => {
    setPhotos([photo("a")]);
    render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());

    fireEvent.keyDown(window, { key: "f" });

    await waitFor(() => expect(screen.queryByRole("heading")).toBeNull());
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(screen.getByAltText(QR_ALT)).toBeInTheDocument();
    expect(screen.queryByText("gdgica.com/events/devfest/subir")).toBeNull();
  });

  it("si el navegador no deja, entra igual y Esc lo quita", async () => {
    document.documentElement.requestFullscreen = vi.fn(() =>
      Promise.reject(new Error("denied"))
    );
    setPhotos([photo("a")]);
    render(view());
    await waitFor(() => expect(tile("a")).not.toBeNull());

    fireEvent.keyDown(window, { key: "f" });
    await waitFor(() => expect(screen.queryByRole("heading")).toBeNull());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("heading")).toBeInTheDocument()
    );
  });

  it("Ctrl+F no hace nada", () => {
    render(view());
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });

  it("quieto unos segundos oculta los controles y el cursor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(view());
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveClass("cursor-none");

    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(root).toHaveClass("cursor-none");

    fireEvent.pointerMove(window);
    expect(root).not.toHaveClass("cursor-none");
  });
});
