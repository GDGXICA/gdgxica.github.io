import { describe, expect, it } from "vitest";
import {
  buildSearchTokens,
  nameTokens,
  normalizeSearchText,
  parseBevyDate,
} from "./nameMatch";

describe("normalizeSearchText", () => {
  it("strips diacritics so accented and unaccented spellings unify", () => {
    // The whole point for Peru: a volunteer typing into the search box
    // will not reach for ñ or í, and Bevy names are self-typed.
    expect(normalizeSearchText("Ñañez Solís")).toBe("nanez solis");
    expect(normalizeSearchText("María Huamaní")).toBe("maria huamani");
    expect(normalizeSearchText("Adrián Yusef")).toBe("adrian yusef");
  });

  it("lowercases and collapses whitespace", () => {
    expect(normalizeSearchText("  ALEX   ALBERTO  ")).toBe("alex alberto");
  });

  it("replaces punctuation with a separator rather than joining words", () => {
    expect(normalizeSearchText("Quintanilla-Garcia")).toBe("quintanilla garcia");
    expect(normalizeSearchText("O'Brien")).toBe("o brien");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText("   ")).toBe("");
  });
});

describe("nameTokens", () => {
  it("splits a full name into normalized tokens", () => {
    expect(nameTokens("Alex Alberto Quintanilla Garcia")).toEqual([
      "alex",
      "alberto",
      "quintanilla",
      "garcia",
    ]);
  });

  it("drops connective particles that appear inconsistently", () => {
    expect(nameTokens("Juan de la Cruz Rojas")).toEqual([
      "juan",
      "cruz",
      "rojas",
    ]);
  });

  it("drops single-character initials", () => {
    expect(nameTokens("Ana M Lopez")).toEqual(["ana", "lopez"]);
  });

  it("dedupes repeated tokens", () => {
    expect(nameTokens("Lopez Lopez")).toEqual(["lopez"]);
  });

  it("is order-independent as a set — the basis for DNI matching", () => {
    const reniec = nameTokens("Quintanilla Garcia Alex Alberto");
    const bevy = nameTokens("Alex Alberto Quintanilla Garcia");
    expect(new Set(reniec)).toEqual(new Set(bevy));
  });
});

describe("buildSearchTokens", () => {
  const attendee = {
    firstName: "Alex Alberto",
    lastName: "Quintanilla Garcia",
    email: "WCandry@Gmail.com",
    ticketNumber: "GOOGA263171317",
  };

  it("lets a volunteer find someone by name, email or ticket", () => {
    const tokens = buildSearchTokens(attendee);
    expect(tokens).toContain("quintanilla");
    expect(tokens).toContain("alex");
    expect(tokens).toContain("wcandry@gmail.com");
    expect(tokens).toContain("wcandry"); // email local part alone
    expect(tokens).toContain("googa263171317");
  });

  it("lowercases the email so search is case-insensitive", () => {
    expect(buildSearchTokens(attendee)).not.toContain("WCandry@Gmail.com");
  });

  it("tolerates missing optional fields", () => {
    const tokens = buildSearchTokens({
      firstName: "Ana",
      lastName: "",
      email: "",
      ticketNumber: "",
    });
    expect(tokens).toEqual(["ana"]);
  });
});

describe("parseBevyDate", () => {
  it("parses the exact format Bevy exports", () => {
    const d = parseBevyDate("Jul 06, 2026 - 03:10 PM");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2026-07-06T15:10:00.000Z");
  });

  it("interprets the time as UTC, per the column header", () => {
    // Would drift by the server's offset if the UTC suffix were dropped.
    expect(parseBevyDate("Jan 01, 2026 - 12:00 AM")?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("returns null for an empty cell — the common case", () => {
    expect(parseBevyDate("")).toBeNull();
    expect(parseBevyDate("   ")).toBeNull();
  });

  it("returns null rather than an Invalid Date for garbage", () => {
    // Critical: a truthy Invalid Date would read as "already checked in
    // on Bevy" and make the sync skip this person entirely.
    expect(parseBevyDate("not a date")).toBeNull();
    expect(parseBevyDate("--")).toBeNull();
  });

  // THE format the CSV export actually writes — verified against the
  // "Paid date (UTC)" column of a real DevFest Ica 2026 export. The
  // dashboard's "Jul 06, 2026 - 03:10 PM" is what the web UI *renders*; an
  // earlier version of this parser only accepted that, so every genuinely
  // checked-in registrant would have parsed to null and the Bevy sync would
  // have silently believed nobody was checked in.
  it("parses the real CSV export format", () => {
    expect(parseBevyDate("2026-07-06 20:10:16+00:00")?.toISOString()).toBe(
      "2026-07-06T20:10:16.000Z"
    );
  });

  it("honours a non-UTC offset instead of assuming UTC", () => {
    expect(parseBevyDate("2026-07-06 15:10:00-05:00")?.toISOString()).toBe(
      "2026-07-06T20:10:00.000Z"
    );
  });

  it.each([
    ["2026-07-06T15:10:00Z", "2026-07-06T15:10:00.000Z"],
    ["2026-07-06 15:10:00", "2026-07-06T15:10:00.000Z"], // no offset = UTC
    ["2026-07-06 15:10", "2026-07-06T15:10:00.000Z"], // seconds optional
    ["2026-07-06 15:10:00.123+00:00", "2026-07-06T15:10:00.123Z"],
  ])("parses ISO variant %j", (input, expected) => {
    expect(parseBevyDate(input)?.toISOString()).toBe(expected);
  });

  // Regression: this used to hand the string to `new Date()`, whose legacy
  // parser skips tokens it does not recognize. Each of these produced a
  // VALID Date, which reads as "already checked in on Bevy" and makes the
  // sync skip someone who never was.
  it.each([
    "2026",
    "Jul 2026",
    "pending Jul 06, 2026",
    "Jul 06, 2026",
    "06/07/2026 - 03:10 PM",
  ])("rejects %j instead of guessing", (input) => {
    expect(parseBevyDate(input)).toBeNull();
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(parseBevyDate("Feb 31, 2026 - 10:00 AM")).toBeNull();
  });

  it("handles the 12-hour boundaries correctly", () => {
    expect(parseBevyDate("Jul 06, 2026 - 12:00 AM")?.toISOString()).toBe(
      "2026-07-06T00:00:00.000Z"
    );
    expect(parseBevyDate("Jul 06, 2026 - 12:30 PM")?.toISOString()).toBe(
      "2026-07-06T12:30:00.000Z"
    );
  });
});
