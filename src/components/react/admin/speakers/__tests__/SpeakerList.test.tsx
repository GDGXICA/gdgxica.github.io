import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listSpeakers: vi.fn(),
  addSpeaker: vi.fn(),
  updateSpeaker: vi.fn(),
  deleteSpeaker: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mocks }));

import { SpeakerList } from "../SpeakerList";

const MARIA = {
  id: "maria-garcia",
  name: "María García",
  bio: "",
  photo_url: "",
  company: "Google",
  role: "Staff Engineer",
  topics: ["Web"],
  social_links: {},
  talk_ids: [],
};

beforeEach(() => {
  const slot = document.createElement("div");
  slot.id = "admin-header-actions";
  document.body.appendChild(slot);
  mocks.listSpeakers.mockResolvedValue({ success: true, data: [MARIA] });
  mocks.addSpeaker.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  document.getElementById("admin-header-actions")?.remove();
  vi.clearAllMocks();
});

describe("SpeakerList", () => {
  it("lets a new speaker get an ID and only saves once name and ID are valid", async () => {
    const user = userEvent.setup();
    render(<SpeakerList />);
    await user.click(
      await screen.findByRole("button", { name: "Nuevo speaker" })
    );

    const id = screen.getByRole("textbox", { name: /^ID/ });
    const submit = screen.getByRole("button", { name: "Agregar speaker" });
    expect(id).toBeEnabled();
    expect(submit).toBeDisabled();
    expect(screen.getByText("Falta: nombre, ID.")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /^Nombre/ }), "Rosa");
    await user.type(id, "rosa quispe");
    expect(id).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();

    await user.clear(id);
    await user.type(id, "rosa-quispe");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(mocks.addSpeaker).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rosa-quispe", name: "Rosa" })
    );
  });

  it("keeps the ID locked when editing", async () => {
    const user = userEvent.setup();
    render(<SpeakerList />);
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByRole("textbox", { name: /^ID/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" })
    ).toBeEnabled();
  });

  it("explains a failed load and retries it", async () => {
    const user = userEvent.setup();
    mocks.listSpeakers.mockResolvedValueOnce({
      success: false,
      error: "An internal error occurred",
    });
    render(<SpeakerList />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron cargar los speakers"
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("María García")).toBeInTheDocument();
  });
});
