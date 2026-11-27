import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useMuralPhotos: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("../../AuthProvider", () => ({ useAuth: mocks.useAuth }));
vi.mock("../useMuralPhotos", () => ({ useMuralPhotos: mocks.useMuralPhotos }));

import { EventMuralManager } from "../EventMuralManager";

const photo = {
  id: "p1",
  eventSlug: "devfest",
  status: "approved",
  uid: "anon-1",
  alias: "Ana",
  storagePath: "mural/devfest/p1.jpg",
  downloadUrl: "https://example.com/p1.jpg",
  width: 100,
  height: 100,
  bytes: 1000,
  createdAt: { seconds: 1 },
  approvedAt: { seconds: 1 },
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: "",
  removalRequestedAt: { seconds: 2 },
  removalRequestNote: "",
  removedReason: null,
};

beforeEach(() => {
  mocks.useMuralPhotos.mockReturnValue({
    pending: [],
    approved: [photo],
    removalRequested: [photo],
    queueFull: false,
    settings: { state: "open", maxPerUid: 3, maxTotal: 200, headline: "" },
    loading: false,
    error: null,
  });
});

afterEach(() => cleanup());

describe("EventMuralManager", () => {
  it("gives an organizer the settings and the takedown", async () => {
    mocks.useAuth.mockReturnValue({ can: () => true });
    render(<EventMuralManager initialSlug="devfest" />);
    expect(screen.getByRole("button", { name: "Ajustes" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /En el mural/ }));
    expect(screen.getByRole("button", { name: "Retirar" })).toBeInTheDocument();
  });

  // A volunteer with the mural capability approves and rejects; settings,
  // limits and taking published photos down are `mural:manage`.
  it("leaves a review-only moderator without settings or takedown", async () => {
    mocks.useAuth.mockReturnValue({
      can: (p: string) => p !== "mural:manage" && p !== "events:read",
    });
    render(<EventMuralManager initialSlug="devfest" />);
    expect(screen.queryByRole("button", { name: "Ajustes" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Por revisar/ })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /En el mural/ }));
    expect(screen.queryByRole("button", { name: "Retirar" })).toBeNull();
  });

  it("exposes quick actions to open the mural projector and copy the upload link", async () => {
    mocks.useAuth.mockReturnValue({ can: () => true });
    const user = userEvent.setup();
    render(<EventMuralManager initialSlug="devfest" />);
    expect(screen.getByRole("link", { name: /Abrir mural/i })).toHaveAttribute(
      "href",
      "/events/devfest/mural"
    );
    await user.click(
      screen.getByRole("button", { name: /Copiar enlace de subida/i })
    );
    expect(
      await screen.findByText(/Enlace de subida copiado/i)
    ).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(
      "https://gdgica.com/events/devfest/subir"
    );
  });
});
