import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listLocations: vi.fn(),
  addLocation: vi.fn(),
  updateLocation: vi.fn(),
  deleteLocation: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mocks }));

import { LocationList } from "../LocationList";
import { describeLocationError } from "../errors";

const UTP = {
  id: "loc-utp-ica",
  name: "UTP sede Ica",
  address: "Av. Ayabaca S/N, Ica 11001",
  map_url: "https://maps.app.goo.gl/abc",
  map_embed: "",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("describeLocationError", () => {
  it("translates the API validation errors and falls back otherwise", () => {
    expect(describeLocationError("Invalid map_embed URL", "x")).toMatch(
      /^El enlace para incrustar/
    );
    expect(describeLocationError("An internal error occurred", "x")).toBe("x");
    expect(describeLocationError(undefined, "x")).toBe("x");
  });
});

describe("LocationList", () => {
  it("opens a saved location for editing and returns to the list", async () => {
    mocks.listLocations.mockResolvedValue({ success: true, data: [UTP] });
    const user = userEvent.setup();
    render(<LocationList />);

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("UTP sede Ica");
    await user.click(
      screen.getByRole("button", { name: "Volver a ubicaciones" })
    );

    expect(screen.getByText("UTP sede Ica")).toBeInTheDocument();
  });

  it("shows the API error in Spanish next to the save button", async () => {
    mocks.listLocations.mockResolvedValue({ success: true, data: [] });
    mocks.addLocation.mockResolvedValue({
      success: false,
      error: "Invalid map_url",
    });
    const user = userEvent.setup();
    render(<LocationList />);

    await user.click(
      await screen.findByRole("button", { name: "Agrega la primera" })
    );
    const add = screen.getByRole("button", { name: "Agregar ubicación" });
    expect(add).toBeDisabled();

    await user.type(screen.getByLabelText(/Nombre/), "Auditorio UNICA");
    await user.click(add);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El enlace de Google Maps no es una dirección web válida"
    );
  });
});
