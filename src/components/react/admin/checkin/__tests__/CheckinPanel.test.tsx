import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Attendee } from "../types";

const mocks = vi.hoisted(() => ({
  useRoster: vi.fn(),
  setCheckedIn: vi.fn(),
  useAuth: vi.fn(),
  isDevPreview: { value: false },
}));

vi.mock("../useRoster", () => ({
  useRoster: mocks.useRoster,
  setCheckedIn: mocks.setCheckedIn,
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/lib/api", () => ({
  get isDevPreview() {
    return mocks.isDevPreview.value;
  },
  api: { importCheckinRoster: vi.fn() },
}));

import { CheckinPanel } from "../CheckinPanel";

const attendee = (over: Partial<Attendee> = {}): Attendee => ({
  id: `t_${over.ticketNumber ?? "T1"}`,
  ticketNumber: "T1",
  orderNumber: "ORD-1",
  firstName: "Alex Alberto",
  lastName: "Quintanilla Garcia",
  email: "wcandry@gmail.com",
  company: "",
  title: "",
  ticketTitle: "General Admission",
  searchTokens: ["alex", "alberto", "quintanilla", "garcia", "wcandry@gmail.com"],
  bevyCheckinAt: null,
  lastImportId: "imp_1",
  checkedIn: false,
  checkedInAt: null,
  checkedInBy: null,
  checkedInByName: null,
  note: null,
  dniVerified: false,
  pending: false,
  ...over,
});

/** Default hook state: one synced attendee, online, no errors. */
function rosterState(over: Record<string, unknown> = {}) {
  return {
    attendees: [attendee()],
    meta: { lastImportId: "imp_1", lastImportAt: null, lastImportByName: null, rosterCount: 1 },
    loading: false,
    error: null,
    offline: false,
    syncedOnce: true,
    metaError: null,
    pendingCount: 0,
    ...over,
  };
}

beforeEach(() => {
  mocks.useRoster.mockReset();
  mocks.setCheckedIn.mockReset();
  mocks.useAuth.mockReset();
  mocks.isDevPreview.value = false;
  mocks.useRoster.mockReturnValue(rosterState());
  mocks.useAuth.mockReturnValue({
    user: { uid: "org-1", displayName: "Alvaro", email: "a@x.com" },
  });
});

afterEach(() => cleanup());

describe("CheckinPanel — it renders at all", () => {
  // The floor. Astro bundles the island without executing it, so a render
  // error here would pass the build and only surface at the door.
  it("mounts and shows the roster", () => {
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    expect(screen.getByText(/Check-in · devfest-ica-2026/)).toBeVisible();
    expect(screen.getByText("Alex Alberto Quintanilla Garcia")).toBeVisible();
  });

  it("explains itself when no event was given", () => {
    render(<CheckinPanel />);
    expect(screen.getByText(/Falta indicar el evento/)).toBeVisible();
  });

  it("does not hit live Firestore in dev preview", () => {
    mocks.isDevPreview.value = true;
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    // A null slug is what stops useRoster subscribing.
    expect(mocks.useRoster).toHaveBeenCalledWith(null);
    expect(screen.getByText(/no funciona con datos de ejemplo/)).toBeVisible();
  });
});

describe("CheckinPanel — searching at the door", () => {
  it("filters by a partial surname", async () => {
    mocks.useRoster.mockReturnValue(
      rosterState({
        attendees: [
          attendee(),
          attendee({
            ticketNumber: "T2",
            firstName: "Maria",
            lastName: "Rodriguez",
            searchTokens: ["maria", "rodriguez"],
          }),
        ],
      })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    await userEvent.type(screen.getByRole("textbox"), "rodri");
    expect(screen.getByText("Maria Rodriguez")).toBeVisible();
    expect(
      screen.queryByText("Alex Alberto Quintanilla Garcia")
    ).not.toBeInTheDocument();
  });

  it("says who was searched for when nothing matches", async () => {
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    await userEvent.type(screen.getByRole("textbox"), "zzz");
    expect(screen.getByText(/Nadie coincide con “zzz”/)).toBeVisible();
  });

  // Regression: the message quoted the (empty) query even when the filter
  // was the checkbox, rendering a bare pair of quotes at the exact moment
  // everyone had been marked.
  it("celebrates instead of quoting an empty query", async () => {
    mocks.useRoster.mockReturnValue(
      rosterState({ attendees: [attendee({ checkedIn: true })] })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/Ya marcaste a todos/)).toBeVisible();
    expect(screen.queryByText(/coincide con “”/)).not.toBeInTheDocument();
  });
});

describe("CheckinPanel — marking someone present", () => {
  it("attributes the check-in to the signed-in volunteer", async () => {
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    await userEvent.click(screen.getByRole("button", { name: "Marcar" }));
    expect(mocks.setCheckedIn).toHaveBeenCalledWith(
      "devfest-ica-2026",
      "t_T1",
      true,
      { uid: "org-1", name: "Alvaro" },
      expect.any(Function)
    );
  });

  it("unmarks someone already present", async () => {
    mocks.useRoster.mockReturnValue(
      rosterState({ attendees: [attendee({ checkedIn: true })] })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    await userEvent.click(screen.getByRole("button", { name: "✓ Presente" }));
    expect(mocks.setCheckedIn).toHaveBeenCalledWith(
      "devfest-ica-2026",
      "t_T1",
      false,
      expect.anything(),
      expect.any(Function)
    );
  });
});

describe("CheckinPanel — empty and error states", () => {
  // Regression: a cold cache reported a fully populated event as empty and
  // offered a re-import — the one action a volunteer must not take mid-door.
  it("does not claim the roster is empty before the server confirms it", () => {
    mocks.useRoster.mockReturnValue(
      rosterState({ attendees: [], syncedOnce: false })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    expect(screen.getByText(/Conectando con el servidor/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Importar el CSV/ })
    ).not.toBeInTheDocument();
  });

  it("offers the import only once the server says the roster is empty", () => {
    mocks.useRoster.mockReturnValue(
      rosterState({ attendees: [], syncedOnce: true })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    expect(screen.getByText(/Todavía no hay nadie en el roster/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Importar el CSV/ })
    ).toBeVisible();
  });

  // Regression: the listener error handler clears the roster, which made
  // the empty-state CTA appear directly under the error banner.
  it("never offers a re-import underneath an error", () => {
    mocks.useRoster.mockReturnValue(
      rosterState({
        attendees: [],
        syncedOnce: true,
        error: "Missing or insufficient permissions.",
      })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    expect(screen.getByText(/insufficient permissions/)).toBeVisible();
    expect(screen.getByText(/Recarga la página/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Importar el CSV/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Todavía no hay nadie en el roster/)
    ).not.toBeInTheDocument();
  });

  it("warns that stale badges are unavailable when meta fails", () => {
    mocks.useRoster.mockReturnValue(rosterState({ metaError: "unavailable" }));
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    expect(screen.getByText(/El check-in funciona normal/)).toBeVisible();
  });

  it("passes the offline state through to the status bar", () => {
    mocks.useRoster.mockReturnValue(
      rosterState({ offline: true, pendingCount: 2 })
    );
    render(<CheckinPanel initialSlug="devfest-ica-2026" />);
    expect(screen.getByText(/Sin conexión — 2 cambios en cola/)).toBeVisible();
  });
});
