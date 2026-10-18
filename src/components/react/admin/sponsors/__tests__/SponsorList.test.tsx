import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listSponsors: vi.fn(),
  addSponsor: vi.fn(),
  updateSponsor: vi.fn(),
  deleteSponsor: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mocks }));

import { SponsorList } from "../SponsorList";

const SPONSORS = [
  {
    name: "Google",
    logo_url: "",
    url: "https://www.google.com",
    sector: "Tecnología",
    description: "",
    featured: true,
  },
  {
    name: "Raro",
    logo_url: "",
    url: "javascript://google.com/%0aalert(1)",
    sector: "",
    description: "",
    featured: false,
  },
];

beforeEach(() => {
  const slot = document.createElement("div");
  slot.id = "admin-header-actions";
  document.body.appendChild(slot);
  mocks.listSponsors.mockResolvedValue({ success: true, data: SPONSORS });
  mocks.addSponsor.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  document.getElementById("admin-header-actions")?.remove();
  vi.clearAllMocks();
});

describe("SponsorList", () => {
  it("groups featured sponsors and only links to http(s) sites", async () => {
    render(<SponsorList />);
    expect(
      await screen.findByRole("region", { name: "Destacados" })
    ).toHaveTextContent("Google");
    expect(
      screen.getByRole("region", { name: "Lista general" })
    ).toHaveTextContent("Raro");
    const links = screen.getAllByRole("link", { name: /Ver sitio/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://www.google.com");
  });

  it("lets a new sponsor be named and saves it", async () => {
    const user = userEvent.setup();
    render(<SponsorList />);
    await user.click(
      await screen.findByRole("button", { name: "Nuevo sponsor" })
    );
    const name = screen.getByRole("textbox", { name: /^Nombre/ });
    const submit = screen.getByRole("button", { name: "Agregar sponsor" });
    expect(name).toBeEnabled();
    expect(submit).toBeDisabled();

    await user.type(name, "Firebase");
    await user.click(screen.getByRole("checkbox", { name: /Destacado/ }));
    await user.click(submit);
    expect(mocks.addSponsor).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Firebase", featured: true })
    );
  });
});
