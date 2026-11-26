import { describe, expect, it } from "vitest";
import {
  deriveSettings,
  formatTimeEs,
  hoursBetween,
  missingSettings,
  parseClock,
  pdfEventFields,
} from "./certificateContent";

describe("parseClock", () => {
  it.each([
    ["01:30 PM", { h: 13, m: 30 }],
    ["1:30 p.m.", { h: 13, m: 30 }],
    ["12:00 PM", { h: 12, m: 0 }],
    ["12:30 AM", { h: 0, m: 30 }],
    ["9 am", { h: 9, m: 0 }],
    ["17:45", { h: 17, m: 45 }],
    ["00:00", { h: 0, m: 0 }],
  ])("reads %s", (raw, expected) => {
    expect(parseClock(raw)).toEqual(expected);
  });

  it.each(["", "mañana", "25:00", "13:00 PM", "10:75", "0 am"])(
    "rejects %j",
    (raw) => {
      expect(parseClock(raw)).toBeNull();
    }
  );
});

describe("hoursBetween", () => {
  it("counts the hours between two times", () => {
    expect(hoursBetween("09:00", "13:30")).toBe(4.5);
  });

  it("crosses midnight", () => {
    expect(hoursBetween("22:00", "02:00")).toBe(4);
  });

  it("is 0 when a time cannot be read", () => {
    expect(hoursBetween("09:00", "")).toBe(0);
  });
});

describe("formatTimeEs", () => {
  it.each([
    ["13:30", "1:30 p.m."],
    ["09:00", "9:00 a.m."],
    ["12:00", "12:00 p.m."],
    ["00:05", "12:05 a.m."],
  ])("%s -> %s", (raw, expected) => {
    expect(formatTimeEs(raw)).toBe(expected);
  });
});

describe("deriveSettings", () => {
  it("reads the data repo's event shape", () => {
    expect(
      deriveSettings({
        title: " DevFest Ica 2026 ",
        date: "2026-11-28T09:00:00",
        end_time: "06:00 PM",
      })
    ).toEqual({
      eventName: "DevFest Ica 2026",
      eventDate: "2026-11-28",
      startTime: "09:00",
      endTime: "18:00",
      hours: 9,
    });
  });

  it("never shifts the date across time zones", () => {
    expect(
      deriveSettings({ date: "2026-12-31T21:00:00", end_time: "11:30 PM" })
        .eventDate
    ).toBe("2026-12-31");
  });

  it("leaves what it cannot read empty", () => {
    expect(
      deriveSettings({ title: 3, date: "2026-11-28", end_time: "tarde" })
    ).toEqual({
      eventName: "",
      eventDate: "2026-11-28",
      startTime: "",
      endTime: "",
      hours: 0,
    });
    expect(deriveSettings({}).eventDate).toBe("");
  });
});

describe("missingSettings", () => {
  const full = {
    eventName: "DevFest",
    eventDate: "2026-11-28",
    startTime: "09:00",
    endTime: "18:00",
    hours: 9,
  };

  it("is empty for complete settings", () => {
    expect(missingSettings(full, "attendee")).toEqual([]);
  });

  it("does not require hours for speakers", () => {
    expect(missingSettings({ ...full, hours: 0 }, "speaker")).toEqual([]);
    expect(missingSettings({ ...full, hours: 0 }, "volunteer")).toEqual([
      "hours",
    ]);
  });

  it("lists everything when there are no settings", () => {
    expect(missingSettings(null, "attendee")).toEqual([
      "eventName",
      "eventDate",
      "startTime",
      "endTime",
      "hours",
    ]);
  });
});

describe("pdfEventFields", () => {
  const settings = {
    eventName: "DevFest",
    eventDate: "2026-11-28",
    startTime: "09:00",
    endTime: "14:00",
    hours: 5,
  };

  it("formats both times the same way", () => {
    expect(pdfEventFields(settings)).toEqual({
      eventName: "DevFest",
      eventDate: "2026-11-28",
      startTime: "9:00 a.m.",
      endTime: "2:00 p.m.",
      hours: 5,
    });
  });

  it("uses a person's own hours when given", () => {
    expect(pdfEventFields(settings, 7.5).hours).toBe(7.5);
    expect(pdfEventFields(settings, null).hours).toBe(5);
  });
});
