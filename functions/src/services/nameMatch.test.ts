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
    "2026-07-06T15:10:00Z",
  ])("rejects %j instead of guessing", (input) => {
    expect(parseBevyDate(input)).toBeNull();
  });

  it("rejects a trailing offset rather than silently overriding it", () => {
    // Appending " UTC" used to win over the real offset, shifting the
    // timestamp by five hours with no error.
    expect(parseBevyDate("Jul 06, 2026 - 03:10 PM -05:00")).toBeNull();
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
