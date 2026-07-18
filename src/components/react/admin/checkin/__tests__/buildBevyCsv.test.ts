import { describe, expect, it } from "vitest";
import { bevyCsvFilename, buildBevyCheckinCsv } from "../buildBevyCsv";
import type { Attendee } from "../types";

const attendee = (over: Partial<Attendee> = {}): Attendee => ({
  id: "t_T1",
  ticketNumber: "T1",
  orderNumber: "ORD-1",
  firstName: "Alex Alberto",
  lastName: "Quintanilla Garcia",
  email: "wcandry@gmail.com",
  company: "",
  title: "",
  ticketTitle: "General Admission",
  searchTokens: [],
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

const lines = (csv: string) => csv.trimEnd().split("\n");

describe("buildBevyCheckinCsv — shape Bevy expects", () => {
  it("writes exactly the four columns the upload uses", () => {
    const { csv } = buildBevyCheckinCsv([]);
    expect(lines(csv)[0]).toBe("first_name,last_name,email,checked_in");
  });

  it("writes one row per person marked present", () => {
    const { csv, rows } = buildBevyCheckinCsv([
      attendee({ checkedIn: true }),
      attendee({
        id: "t_T2",
        checkedIn: true,
        firstName: "Maria",
        lastName: "Rodriguez",
        email: "maria@x.com",
      }),
    ]);
    expect(rows).toBe(2);
    expect(lines(csv)).toEqual([
      "first_name,last_name,email,checked_in",
      "Alex Alberto,Quintanilla Garcia,wcandry@gmail.com,TRUE",
      "Maria,Rodriguez,maria@x.com,TRUE",
    ]);
  });

  it("ends with a newline so the last row is terminated", () => {
    const { csv } = buildBevyCheckinCsv([attendee({ checkedIn: true })]);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("produces a header-only file when nobody was marked", () => {
    const { csv, rows } = buildBevyCheckinCsv([attendee(), attendee()]);
    expect(rows).toBe(0);
    expect(lines(csv)).toEqual(["first_name,last_name,email,checked_in"]);
  });
});

describe("buildBevyCheckinCsv — what it deliberately leaves out", () => {
  // Bevy is the system of record and a volunteer may have used the Bevy
  // app directly. A checked_in=FALSE row would undo that, so absentees are
  // never written: this upload only ever adds check-ins.
  it("never includes absentees", () => {
    const { csv, rows } = buildBevyCheckinCsv([
      attendee({ checkedIn: true }),
      attendee({ id: "t_T2", email: "absent@x.com", checkedIn: false }),
    ]);
    expect(rows).toBe(1);
    expect(csv).not.toContain("absent@x.com");
    expect(csv).not.toContain("FALSE");
  });

  it("skips people Bevy already has checked in", () => {
    const { csv, rows, alreadyInBevy } = buildBevyCheckinCsv([
      attendee({ checkedIn: true }),
      attendee({
        id: "t_T2",
        email: "done@x.com",
        checkedIn: true,
        bevyCheckinAt: new Date("2026-07-18T09:15:00Z"),
      }),
    ]);
    expect(rows).toBe(1);
    expect(alreadyInBevy).toBe(1);
    expect(csv).not.toContain("done@x.com");
  });

  // Re-running after a partial upload should shrink to nothing, not
  // re-send the same people.
  it("produces an empty upload once Bevy is fully in sync", () => {
    const { rows, alreadyInBevy } = buildBevyCheckinCsv([
      attendee({ checkedIn: true, bevyCheckinAt: new Date() }),
      attendee({ id: "t_T2", checkedIn: true, bevyCheckinAt: new Date() }),
    ]);
    expect(rows).toBe(0);
    expect(alreadyInBevy).toBe(2);
  });
});

describe("buildBevyCheckinCsv — escaping", () => {
  it("quotes a surname containing a comma", () => {
    const { csv } = buildBevyCheckinCsv([
      attendee({ checkedIn: true, lastName: "Quintanilla, Garcia" }),
    ]);
    expect(lines(csv)[1]).toBe(
      'Alex Alberto,"Quintanilla, Garcia",wcandry@gmail.com,TRUE'
    );
  });

  it("escapes embedded double quotes", () => {
    const { csv } = buildBevyCheckinCsv([
      attendee({ checkedIn: true, firstName: 'Ana "Ani"' }),
    ]);
    expect(lines(csv)[1]).toContain('"Ana ""Ani"""');
  });

  it("preserves diacritics — Bevy matches on the email anyway", () => {
    const { csv } = buildBevyCheckinCsv([
      attendee({ checkedIn: true, firstName: "María", lastName: "Ñañez" }),
    ]);
    expect(csv).toContain("María,Ñañez");
  });
});

describe("bevyCsvFilename", () => {
  it("identifies the event and the moment", () => {
    // Local time, not UTC: constructed from local components so the
    // assertion holds in any timezone the suite runs in.
    const at = new Date(2026, 6, 18, 14, 22, 10);
    expect(bevyCsvFilename("devfest-ica-2026", at)).toBe(
      "bevy-checkin-devfest-ica-2026-2026-07-18-14-22.csv"
    );
  });

  // Regression: toISOString() stamped UTC, so an export at 4:17 pm in Ica
  // was named ...-21-17 — five hours off the clock the organizer is
  // reading while deciding which file is the latest.
  it("uses the organizer's local clock, not UTC", () => {
    const at = new Date(2026, 6, 18, 16, 17, 0);
    expect(bevyCsvFilename("e", at)).toContain("-16-17.csv");
  });

  it("zero-pads so names sort chronologically", () => {
    const at = new Date(2026, 0, 5, 9, 4, 0);
    expect(bevyCsvFilename("e", at)).toBe(
      "bevy-checkin-e-2026-01-05-09-04.csv"
    );
  });
});
