import { describe, expect, it } from "vitest";
import { buildManualAttendeesCsv, manualCsvFilename } from "../buildManualCsv";
import type { Attendee } from "../types";

const attendee = (over: Partial<Attendee> = {}): Attendee => ({
  id: "m_1",
  source: "manual",
  ticketNumber: "",
  orderNumber: "",
  firstName: "Lucía",
  lastName: "Quispe",
  email: "lucia@example.com",
  company: "",
  title: "",
  ticketTitle: "General Admission",
  searchTokens: [],
  bevyCheckinAt: null,
  lastImportId: "",
  checkedIn: true,
  checkedInAt: new Date("2026-11-27T15:30:00.000Z"),
  checkedInBy: "vol-1",
  checkedInByName: "Alvaro",
  note: null,
  dniVerified: false,
  dni: "71234567",
  heardAbout: "Redes sociales",
  pending: false,
  ...over,
});

const lines = (csv: string) => csv.trimEnd().split("\n");

describe("buildManualAttendeesCsv", () => {
  it("exports only manual attendees with all captured fields", () => {
    const { csv, rows } = buildManualAttendeesCsv([
      attendee(),
      attendee({
        id: "t_BEVY1",
        source: "bevy",
        email: "bevy@example.com",
      }),
      attendee({
        id: "m_2",
        firstName: "Ana",
        lastName: "Torres, Perez",
        email: "ana@example.com",
        dni: null,
        heardAbout: null,
        checkedIn: false,
        checkedInAt: null,
      }),
    ]);

    expect(rows).toBe(2);
    expect(lines(csv)).toEqual([
      "first_name,last_name,email,ticket_title,dni,how_heard,checked_in,checked_in_at",
      "Lucía,Quispe,lucia@example.com,General Admission,71234567,Redes sociales,TRUE,2026-11-27T15:30:00.000Z",
      'Ana,"Torres, Perez",ana@example.com,General Admission,,,FALSE,',
    ]);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("returns 0 rows when there are no manual attendees", () => {
    const { rows, csv } = buildManualAttendeesCsv([
      attendee({ id: "t_1", source: "bevy" }),
    ]);
    expect(rows).toBe(0);
    expect(lines(csv)).toEqual([
      "first_name,last_name,email,ticket_title,dni,how_heard,checked_in,checked_in_at",
    ]);
  });
});

describe("manualCsvFilename", () => {
  it("builds a local-time filename prefixed with sin-bevy", () => {
    const at = new Date(2026, 10, 27, 9, 5, 0);
    expect(manualCsvFilename("devfest-2026", at)).toBe(
      "sin-bevy-devfest-2026-2026-11-27-09-05.csv"
    );
  });
});
