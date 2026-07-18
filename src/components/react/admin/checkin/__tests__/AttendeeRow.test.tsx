import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendeeRow } from "../AttendeeRow";
import type { Attendee } from "../types";

afterEach(() => cleanup());

const attendee = (over: Partial<Attendee> = {}): Attendee => ({
  id: "t_GOOGA263171317",
  ticketNumber: "GOOGA263171317",
  orderNumber: "ORD-1",
  firstName: "Alex Alberto",
  lastName: "Quintanilla Garcia",
  email: "wcandry@gmail.com",
  company: "",
  title: "",
  ticketTitle: "General Admission",
  searchTokens: ["alex", "quintanilla"],
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

describe("AttendeeRow", () => {
  it("shows who the row is for", () => {
    render(
      <AttendeeRow attendee={attendee()} stale={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText("Alex Alberto Quintanilla Garcia")).toBeVisible();
    expect(screen.getByText("wcandry@gmail.com")).toBeVisible();
  });

  it("offers to mark someone who is not checked in", async () => {
    const onToggle = vi.fn();
    render(<AttendeeRow attendee={attendee()} stale={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Marcar" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects an already-present attendee and allows undoing it", async () => {
    const onToggle = vi.fn();
    render(
      <AttendeeRow
        attendee={attendee({ checkedIn: true })}
        stale={false}
        onToggle={onToggle}
      />
    );
    const button = screen.getByRole("button", { name: "✓ Presente" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // The attribution the Firestore rules go out of their way to require is
  // useless if the UI never shows it. This regressed once already, when a
  // pending serverTimestamp read back as null and hid the whole line.
  it("shows the time and who marked them", () => {
    render(
      <AttendeeRow
        attendee={attendee({
          checkedIn: true,
          checkedInAt: new Date("2026-07-18T14:22:10Z"),
          checkedInByName: "Alvaro",
        })}
        stale={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText(/Alvaro/)).toBeVisible();
  });

  it("flags someone who dropped out of the latest CSV", () => {
    render(
      <AttendeeRow attendee={attendee()} stale={true} onToggle={vi.fn()} />
    );
    expect(screen.getByText("ya no está en el CSV")).toBeVisible();
  });

  it("flags someone Bevy already has checked in", () => {
    render(
      <AttendeeRow
        attendee={attendee({ bevyCheckinAt: new Date("2026-07-18T09:15:00Z") })}
        stale={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText("ya marcado en Bevy")).toBeVisible();
  });

  it("does not flag a normal attendee", () => {
    render(
      <AttendeeRow attendee={attendee()} stale={false} onToggle={vi.fn()} />
    );
    expect(screen.queryByText("ya no está en el CSV")).not.toBeInTheDocument();
    expect(screen.queryByText("ya marcado en Bevy")).not.toBeInTheDocument();
  });
});
