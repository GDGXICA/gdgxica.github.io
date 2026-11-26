import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CertificateItem, EventCertificates } from "@/lib/api";

const api = vi.hoisted(() => ({
  getEventCertificates: vi.fn(),
  pollEventCertificates: vi.fn(),
  saveCertificateSettings: vi.fn(),
  enqueueCertificates: vi.fn(),
  cancelCertificates: vi.fn(),
  addCertificatePeople: vi.fn(),
  updateCertificatePerson: vi.fn(),
  removeCertificatePerson: vi.fn(),
  previewCertificate: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api }));

import { EventCertificatesPanel } from "../EventCertificatesPanel";

const SETTINGS = {
  eventName: "DevFest Ica 2026",
  eventDate: "2026-11-28",
  startTime: "09:00",
  endTime: "18:00",
  hours: 9,
};

function person(over: Partial<CertificateItem>): CertificateItem {
  return {
    id: "x",
    kind: "attendee",
    source: "roster",
    rosterId: null,
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    hours: null,
    status: "pending",
    attempts: 0,
    lastError: null,
    sentAt: null,
    queuedAt: null,
    updatedAt: 1,
    resendCount: 0,
    overridden: false,
    eventRef: null,
    content: null,
    ...over,
  };
}

const ANA = person({
  id: "c-ana",
  rosterId: "t_1",
  name: "Ana Torres",
  email: "ana@x.com",
  checkin: "panel",
});
const LUIS = person({
  id: "c-luis",
  rosterId: "t_2",
  name: "Luis Paz",
  email: "luis@x.com",
  checkin: "bevy",
  status: "sent",
  sentAt: 1,
});
const EVA = person({
  id: "c-eva",
  rosterId: "t_3",
  name: "Eva Ríos",
  email: "eva@x.com",
  checkin: "both",
  status: "failed",
  attempts: 6,
  lastError: "550 mailbox unavailable",
});

function data(over: Partial<EventCertificates> = {}): EventCertificates {
  return {
    serverTime: 100_000,
    settings: SETTINGS,
    settingsSaved: true,
    attendees: [ANA, LUIS, EVA],
    people: [],
    roster: { total: 5, lastImportAt: null, checkedIn: 3 },
    budget: { sentToday: 10, cap: 350, transport: "gmail" },
    ...over,
  };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getEventCertificates.mockResolvedValue({ success: true, data: data() });
  api.pollEventCertificates.mockResolvedValue({
    success: true,
    data: { serverTime: 200_000, changes: [] },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EventCertificatesPanel", () => {
  it("lists attendees with their check-in source and status", async () => {
    render(<EventCertificatesPanel slug="devfest" />);
    expect(await screen.findByText("Ana Torres")).toBeInTheDocument();
    expect(screen.getByText("Check-in en Bevy")).toBeInTheDocument();
    expect(screen.getByText("Check-in y Bevy")).toBeInTheDocument();
    expect(screen.getByText(/550 mailbox unavailable/)).toBeInTheDocument();
    expect(
      screen.getByText(/2 personas inscritas sin check-in no reciben/)
    ).toBeInTheDocument();
  });

  it("does not send anything until the certificate data is saved", async () => {
    api.getEventCertificates.mockResolvedValue({
      success: true,
      data: data({ settingsSaved: false }),
    });
    render(<EventCertificatesPanel slug="devfest" />);
    await screen.findByText("Ana Torres");
    expect(
      screen.getByRole("button", { name: /Enviar a 1 pendiente/ })
    ).toBeDisabled();
    expect(
      screen.getByText("Guarda los datos del certificado para poder enviar.")
    ).toBeInTheDocument();

    api.saveCertificateSettings.mockResolvedValue({
      success: true,
      data: { settings: SETTINGS, settingsSaved: true },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar datos" })
    );
    expect(api.saveCertificateSettings).toHaveBeenCalledWith(
      "devfest",
      SETTINGS
    );
    expect(
      screen.getByRole("button", { name: /Enviar a 1 pendiente/ })
    ).toBeEnabled();
  });

  it("sends exactly the pending people shown in the confirmation", async () => {
    api.enqueueCertificates.mockResolvedValue({
      success: true,
      data: { queued: 1, skipped: [] },
    });
    render(<EventCertificatesPanel slug="devfest" />);
    await screen.findByText("Ana Torres");
    await userEvent.click(
      screen.getByRole("button", { name: /Enviar a 1 pendiente/ })
    );
    // Sent and failed certificates are not "pending".
    const list = screen.getByText(
      /Certificado de participación para 1 persona/
    ).parentElement!;
    expect(within(list).getByText("ana@x.com")).toBeInTheDocument();
    expect(within(list).queryByText("luis@x.com")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Enviar 1 certificado" })
    );
    // Attendees go by roster id: the server re-checks their check-in.
    expect(api.enqueueCertificates).toHaveBeenCalledWith("devfest", {
      kind: "attendee",
      ids: ["t_1"],
      resend: false,
    });
    expect(await screen.findByText("En cola")).toBeInTheDocument();
  });

  it("retries a failed certificate from its row", async () => {
    api.enqueueCertificates.mockResolvedValue({
      success: true,
      data: { queued: 1, skipped: [] },
    });
    render(<EventCertificatesPanel slug="devfest" />);
    await screen.findByText("Eva Ríos");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(api.enqueueCertificates).toHaveBeenCalledWith("devfest", {
      kind: "attendee",
      ids: ["t_3"],
      resend: false,
    });
  });

  it("asks before re-sending to someone who already received it", async () => {
    api.enqueueCertificates.mockResolvedValue({
      success: true,
      data: { queued: 1, skipped: [] },
    });
    render(<EventCertificatesPanel slug="devfest" />);
    await screen.findByText("Luis Paz");
    await userEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    expect(api.enqueueCertificates).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, reenviar" }));
    expect(api.enqueueCertificates).toHaveBeenCalledWith("devfest", {
      kind: "attendee",
      ids: ["t_2"],
      resend: true,
    });
  });

  it("polls only while something is on its way, and shows it sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getEventCertificates.mockResolvedValue({
      success: true,
      data: data({ attendees: [{ ...ANA, status: "queued" }] }),
    });
    api.pollEventCertificates.mockResolvedValue({
      success: true,
      data: {
        serverTime: 200_000,
        changes: [{ ...ANA, checkin: undefined, status: "sent", sentAt: 2 }],
      },
    });
    render(<EventCertificatesPanel slug="devfest" />);
    expect(await screen.findByText("En cola")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.pollEventCertificates).toHaveBeenCalledWith("devfest", 95_000);
    await waitFor(() =>
      expect(screen.getByText("Enviado")).toBeInTheDocument()
    );
    // The roster-only field survives the merge.
    expect(screen.getByText("Check-in")).toBeInTheDocument();

    api.pollEventCertificates.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.pollEventCertificates).not.toHaveBeenCalled();
  });

  it("registers volunteers and refuses an invalid email before calling the API", async () => {
    render(<EventCertificatesPanel slug="devfest" />);
    await screen.findByText("Ana Torres");
    await userEvent.click(
      screen.getByRole("button", { name: /^Voluntariado/ })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar voluntarios" })
    );
    await userEvent.type(screen.getByLabelText("Nombres, fila 1"), "Diana");
    await userEvent.type(screen.getByLabelText("Correo, fila 1"), "diana@mal");
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar 1 persona" })
    );
    expect(screen.getByText("Este correo no es válido.")).toBeInTheDocument();
    expect(api.addCertificatePeople).not.toHaveBeenCalled();

    api.addCertificatePeople.mockResolvedValue({
      success: true,
      data: {
        added: [
          person({
            id: "v1",
            kind: "volunteer",
            source: "registered",
            name: "Diana",
            email: "diana@mail.com",
            hours: 12,
          }),
        ],
        skipped: [],
      },
    });
    const email = screen.getByLabelText("Correo, fila 1");
    await userEvent.clear(email);
    await userEvent.type(email, "Diana@Mail.com");
    await userEvent.type(screen.getByLabelText("Horas, fila 1"), "12");
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar 1 persona" })
    );
    expect(api.addCertificatePeople).toHaveBeenCalledWith(
      "devfest",
      "volunteer",
      [{ firstName: "Diana", lastName: "", email: "diana@mail.com", hours: 12 }]
    );
    expect(await screen.findByText("Diana")).toBeInTheDocument();
  });
});
