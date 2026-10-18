import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BevyQueue } from "../BevyQueue";
import type { Credential } from "../types";

vi.mock("@/lib/api", () => ({ api: {} }));

afterEach(() => cleanup());

const credential: Credential = {
  id: "c1",
  dni: "72345678",
  dniNormalized: "72345678",
  firstName: "Lucía",
  lastName: "Paredes",
  email: "lucia@example.com",
  company: "",
  githubUsername: null,
  heardAbout: "",
  heardAboutOther: "",
  yearsExperience: "",
  googleToolsLevel: "",
  sequenceNumber: 7,
  groupLetter: "A",
  avatarKind: "mascot",
  mascotId: null,
  photoStatus: "none",
  photoPath: null,
  credentialImagePath: null,
  photoUploadedAt: null,
  emailStatus: "sent",
  emailAttempts: 1,
  emailLastError: null,
  emailSentAt: null,
  bevyStatus: "pending",
  bevyTicketNumber: null,
  bevyNote: null,
  bevyLoadedAt: null,
  createdAt: null,
};

describe("BevyQueue", () => {
  it("keeps the DNI masked, tooltip included, until revealed", () => {
    const { container } = render(
      <BevyQueue
        slug="devfest"
        credentials={[credential]}
        conflicts={new Set()}
        onError={() => {}}
      />
    );

    expect(screen.getByText("****5678")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("72345678");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar DNI" }));
    expect(screen.getByText("72345678")).toBeInTheDocument();
  });

  it("labels the ticket field with the person's name", () => {
    render(
      <BevyQueue
        slug="devfest"
        credentials={[credential]}
        conflicts={new Set()}
        onError={() => {}}
      />
    );
    expect(
      screen.getByLabelText("Número de ticket de Bevy de Lucía Paredes")
    ).toBeInstanceOf(HTMLInputElement);
  });

  it("explains an empty view", () => {
    render(
      <BevyQueue
        slug="devfest"
        credentials={[]}
        conflicts={new Set()}
        onError={() => {}}
        emptyMessage="No queda nadie por cargar en Bevy."
      />
    );
    expect(
      screen.getByText("No queda nadie por cargar en Bevy.")
    ).toBeInTheDocument();
  });
});
