import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSPORT,
  EMAIL_TRANSPORTS,
  dailyCapFor,
  isEmailTransport,
} from "./emailTransport";

describe("isEmailTransport", () => {
  it.each(EMAIL_TRANSPORTS)("accepts %s", (t) => {
    expect(isEmailTransport(t)).toBe(true);
  });

  it.each([null, undefined, 42, "sendgrid", "GMAIL", ""])(
    "rejects %j",
    (value) => {
      // A stored value that is not a known transport must not be trusted:
      // readEmailTransport falls back to the default rather than passing
      // an unknown string to the sender.
      expect(isEmailTransport(value)).toBe(false);
    }
  );
});

describe("DEFAULT_TRANSPORT", () => {
  it("is gmail", () => {
    // Gmail needs no new credentials, so a project that never configures
    // Resend still sends. Switching is a deliberate act in the panel.
    expect(DEFAULT_TRANSPORT).toBe("gmail");
  });
});

describe("dailyCapFor", () => {
  it("keeps Resend under its free-tier daily limit", () => {
    // Resend's free tier stops at 100 messages a day. The monthly 3,000
    // never binds at event scale, but the daily one does.
    expect(dailyCapFor("resend")).toBeLessThan(100);
  });

  it("leaves headroom rather than sitting exactly on the limit", () => {
    // The account may send other things; landing on 100 would make an
    // unrelated message the one that fails.
    expect(dailyCapFor("resend")).toBeLessThanOrEqual(95);
    expect(dailyCapFor("resend")).toBeGreaterThan(50);
  });

  it("allows more through Gmail, which tolerates a higher volume", () => {
    expect(dailyCapFor("gmail")).toBeGreaterThan(dailyCapFor("resend"));
  });

  it("returns a usable cap for every known transport", () => {
    for (const t of EMAIL_TRANSPORTS) {
      expect(dailyCapFor(t)).toBeGreaterThan(0);
      expect(Number.isInteger(dailyCapFor(t))).toBe(true);
    }
  });
});
