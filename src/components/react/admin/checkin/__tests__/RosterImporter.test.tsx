import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  importCheckinRoster: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  isDevPreview: false,
  api: { importCheckinRoster: mocks.importCheckinRoster },
}));

import { RosterImporter } from "../RosterImporter";

const HEADER =
  "Order number,Ticket number,First Name,Last Name,Email,Twitter,Company," +
  "Title,Featured,Ticket title,Ticket venue,Access code,Discount,Price," +
  "Currency,Number of tickets,Paid by (name),Paid by (email)," +
  "Paid date (UTC),Checkin Date (UTC),Ticket Price Paid";

const row = (ticket: string, email: string, first = "Ana", last = "Lopez") =>
  [
    "ORD-1",
    ticket,
    first,
    last,
    email,
    "",
    "",
    "",
    "",
    "General Admission",
    "In-person",
    "",
    "",
    "0.00",
    "USD",
    "1",
    "",
    "",
    "2026-07-06 20:10:16+00:00",
    "",
    "0.00",
  ].join(",");

function csvFile(lines: string[]) {
  return new File([lines.join("\n")], "bevy.csv", { type: "text/csv" });
}

const ok = (over: Record<string, number | string> = {}) => ({
  success: true as const,
  data: {
    importId: "imp_1",
    total: 1,
    created: 1,
    updated: 0,
    stale: 0,
    unusableTickets: 0,
    ...over,
  },
});

beforeEach(() => {
  mocks.importCheckinRoster.mockReset();
  mocks.importCheckinRoster.mockResolvedValue(ok());
});

afterEach(() => cleanup());

// The file input has no visible label, so query it by role/type instead.
function fileInput(): HTMLInputElement {
  const el = document.querySelector('input[type="file"]');
  if (!el) throw new Error("file input not found");
  return el as HTMLInputElement;
}

describe("RosterImporter", () => {
  it("shows how many registrations are ready before committing", async () => {
    render(<RosterImporter slug="devfest-ica-2026" onImported={vi.fn()} />);
    await userEvent.upload(
      fileInput(),
      csvFile([HEADER, row("T1", "a@x.com"), row("T2", "b@x.com")])
    );
    expect(
      await screen.findByText(/2 registrados listos para importar/)
    ).toBeVisible();
  });

  it("sends the parsed rows and reports the outcome", async () => {
    const onImported = vi.fn();
    mocks.importCheckinRoster.mockResolvedValue(
      ok({ created: 2, updated: 3, stale: 1 })
    );
    render(<RosterImporter slug="devfest-ica-2026" onImported={onImported} />);
    await userEvent.upload(fileInput(), csvFile([HEADER, row("T1", "a@x.com")]));
    await userEvent.click(await screen.findByRole("button", { name: "Importar" }));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(mocks.importCheckinRoster).toHaveBeenCalledWith(
      "devfest-ica-2026",
      expect.arrayContaining([expect.objectContaining({ ticketNumber: "T1" })])
    );
    expect(onImported.mock.calls[0][0]).toMatch(
      /2 nuevos, 3 actualizados, 1 ya no figuran/
    );
  });

  it("surfaces the parser's warnings before the organizer commits", async () => {
    render(<RosterImporter slug="devfest-ica-2026" onImported={vi.fn()} />);
    await userEvent.upload(
      fileInput(),
      csvFile([HEADER, row("T1", "a@x.com"), row("", "b@x.com")])
    );
    expect(await screen.findByText(/Ticket number/)).toBeVisible();
  });

  it("refuses a file past the server's row cap with an actionable message", async () => {
    render(<RosterImporter slug="devfest-ica-2026" onImported={vi.fn()} />);
    const many = Array.from({ length: 2001 }, (_, i) =>
      row(`T${i}`, `u${i}@x.com`)
    );
    await userEvent.upload(fileInput(), csvFile([HEADER, ...many]));
    expect(await screen.findByText(/máximo por importación es 2000/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
    expect(mocks.importCheckinRoster).not.toHaveBeenCalled();
  });

  it("shows the server's error instead of failing silently", async () => {
    mocks.importCheckinRoster.mockResolvedValue({
      success: false,
      error: "Sesión expirada",
    });
    render(<RosterImporter slug="devfest-ica-2026" onImported={vi.fn()} />);
    await userEvent.upload(fileInput(), csvFile([HEADER, row("T1", "a@x.com")]));
    await userEvent.click(await screen.findByRole("button", { name: "Importar" }));
    expect(await screen.findByText("Sesión expirada")).toBeVisible();
  });

  // Regression: request() awaits getIdToken() OUTSIDE its try block, so a
  // token refresh on flaky venue wifi rejects instead of resolving
  // {success:false}. Without try/finally the button stayed disabled reading
  // "Importando…" until a full page reload.
  it("recovers the button when the request rejects outright", async () => {
    mocks.importCheckinRoster.mockRejectedValue(new Error("Network down"));
    render(<RosterImporter slug="devfest-ica-2026" onImported={vi.fn()} />);
    await userEvent.upload(fileInput(), csvFile([HEADER, row("T1", "a@x.com")]));
    await userEvent.click(await screen.findByRole("button", { name: "Importar" }));

    expect(await screen.findByText("Network down")).toBeVisible();
    const button = await screen.findByRole("button", { name: "Importar" });
    expect(button).toBeEnabled();
  });

  it("reports tickets the server could not use", async () => {
    const onImported = vi.fn();
    mocks.importCheckinRoster.mockResolvedValue(ok({ unusableTickets: 2 }));
    render(<RosterImporter slug="devfest-ica-2026" onImported={onImported} />);
    await userEvent.upload(fileInput(), csvFile([HEADER, row("T1", "a@x.com")]));
    await userEvent.click(await screen.findByRole("button", { name: "Importar" }));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(onImported.mock.calls[0][0]).toMatch(/2 sin ticket utilizable/);
  });
});
