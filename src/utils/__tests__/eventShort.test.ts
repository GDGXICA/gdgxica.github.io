import { describe, expect, it } from "vitest";
import {
  badgeDate,
  dottedDate,
  hourRange,
  shortVenue,
  surveyDate,
} from "@/utils/eventShort";

// DevFest ICA 2026: Saturday 28 November, 9:00 to 13:30 in Ica (UTC-5).
const START = "2026-11-28T09:00:00-05:00";
const END = "2026-11-28T13:30:00-05:00";

describe("eventShort", () => {
  it("prints the badge date in lower case, without abbreviation dots", () => {
    expect(badgeDate(START)).toBe("sáb 28 nov");
  });

  it("keeps the Lima day even for a late-evening event", () => {
    // 22:00 in Ica is already the next day in UTC.
    expect(badgeDate("2026-11-28T22:00:00-05:00")).toBe("sáb 28 nov");
  });

  it("prints the hour range in 24-hour time, Lima time", () => {
    expect(hourRange(START, END)).toBe("09:00–13:30");
  });

  it("shortens venues to the acronym or the first part", () => {
    expect(
      shortVenue("Universidad Tecnologica del Peru (UTP) - Sede Ica", false)
    ).toBe("UTP Ica");
    expect(shortVenue("Zegel - Sede Ica", false)).toBe("Zegel");
    expect(shortVenue("Universidad Continental, campus Ica", false)).toBe(
      "Universidad Continental, campus Ica"
    );
    expect(shortVenue("Google Meet", true)).toBe("En línea");
  });

  it("prints the survey date day-first with dots, Lima time", () => {
    expect(dottedDate(START)).toBe("28.11.2026");
    expect(dottedDate("2026-03-01T22:00:00-05:00")).toBe("01.03.2026");
    expect(surveyDate(START)).toBe("sáb 28.11.2026");
  });
});
