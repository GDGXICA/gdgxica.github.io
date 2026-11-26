import { describe, expect, it } from "vitest";
import type { CertificateItem, EventCertificates } from "@/lib/api";
import { applyChanges } from "../useEventCertificates";
import { blankPerson, checkPeople, issuesByRow } from "../PeopleRowsEditor";
import { draftErrors, toDraft } from "../SettingsFields";
import { describeSkipped } from "../kinds";
import { formatTime, hoursBetween } from "../format";

const base = (over: Partial<CertificateItem>): CertificateItem =>
  ({
    id: "a",
    kind: "attendee",
    status: "pending",
    rosterId: "t_1",
    checkin: "panel",
    ...over,
  }) as CertificateItem;

describe("applyChanges", () => {
  const data = {
    attendees: [base({})],
    people: [base({ id: "v", kind: "volunteer", rosterId: null })],
  } as EventCertificates;

  it("updates by id and keeps the attendee's roster fields", () => {
    const next = applyChanges(data, [
      base({ status: "sent", checkin: undefined, rosterId: null }),
    ]);
    expect(next.attendees[0]).toMatchObject({
      status: "sent",
      checkin: "panel",
      rosterId: "t_1",
    });
  });

  it("adds new volunteers and speakers", () => {
    const next = applyChanges(data, [
      base({ id: "s", kind: "speaker", rosterId: null }),
    ]);
    expect(next.people.map((p) => p.id)).toEqual(["v", "s"]);
  });
});

describe("checkPeople", () => {
  it("ignores blank rows and flags each problem on its row", () => {
    const rows = [
      blankPerson({ firstName: "Ana", email: "ANA@x.com" }),
      blankPerson({ firstName: "Luis", email: "josé@x.com" }),
      blankPerson({ email: "eva@x.com" }),
      blankPerson({ firstName: "Ana", email: "ana@x.com" }),
      blankPerson({ firstName: "Pía", email: "pia@x.com", hours: "-1" }),
      blankPerson(),
    ];
    const { valid, errors, filled } = checkPeople(rows);
    expect(valid).toEqual([
      {
        key: rows[0].key,
        firstName: "Ana",
        lastName: "",
        email: "ana@x.com",
        hours: null,
      },
    ]);
    expect(errors).toEqual({
      [rows[1].key]: "Este correo no es válido.",
      [rows[2].key]: "Falta el nombre.",
      [rows[3].key]: "Esta persona ya está en la lista.",
      [rows[4].key]: "Las horas deben ser un número mayor que 0.",
    });
    expect(filled).toBe(5);
  });

  it("maps the API's issues back to the rows that were sent", () => {
    const sent = [{ key: "a" }, { key: "b" }];
    expect(
      issuesByRow(
        [{ path: "recipients.1.email", message: "Invalid email" }],
        sent,
        "recipients"
      )
    ).toEqual({ b: "El servidor rechazó este correo." });
  });
});

describe("settings draft", () => {
  it("requires hours only when the certificate credits them", () => {
    const draft = toDraft({
      eventName: "DevFest",
      eventDate: "2026-11-28",
      startTime: "09:00",
      endTime: "18:00",
      hours: 0,
    });
    expect(draftErrors(draft, false)).toEqual({});
    expect(Object.keys(draftErrors(draft, true))).toEqual(["hours"]);
  });
});

describe("formatting", () => {
  it("formats times and hours like the certificate", () => {
    expect(formatTime("13:30")).toBe("1:30 p.m.");
    expect(formatTime("00:05")).toBe("12:05 a.m.");
    expect(hoursBetween("22:00", "02:00")).toBe(4);
  });

  it("summarizes skipped people by reason", () => {
    expect(
      describeSkipped([
        { reason: "already_sent" },
        { reason: "already_sent" },
        { reason: "no_checkin" },
      ])
    ).toBe("2 ya lo recibió, 1 sin check-in");
  });
});
