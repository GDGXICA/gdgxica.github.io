import { describe, expect, it } from "vitest";
import {
  budgetDocId,
  computeBackoff,
  DAILY_CAP,
  hasAttemptsLeft,
  isLeaseStale,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  remainingBudget,
} from "./credentialQueue";

describe("computeBackoff", () => {
  // rand() === 0.5 makes the jitter factor exactly 1, so the base delay is
  // observable without loosening the assertion.
  const noJitter = () => 0.5;

  it("grows exponentially from one minute", () => {
    expect(computeBackoff(1, noJitter)).toBe(120);
    expect(computeBackoff(2, noJitter)).toBe(240);
    expect(computeBackoff(3, noJitter)).toBe(480);
  });

  it("is monotonic up to the cap", () => {
    let previous = 0;
    for (let attempts = 1; attempts <= 8; attempts++) {
      const delay = computeBackoff(attempts, noJitter);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it("caps at six hours", () => {
    expect(computeBackoff(20, noJitter)).toBe(6 * 60 * 60);
    expect(computeBackoff(100, noJitter)).toBe(6 * 60 * 60);
  });

  it("stays within +/-20% of the base delay", () => {
    // Jitter exists because a Gmail throttle fails the whole batch at once;
    // without it every document would return at the same instant.
    for (const rand of [() => 0, () => 1, () => 0.25, () => 0.75]) {
      const delay = computeBackoff(3, rand);
      expect(delay).toBeGreaterThanOrEqual(480 * 0.8);
      expect(delay).toBeLessThanOrEqual(480 * 1.2);
    }
  });

  it("actually varies across draws", () => {
    expect(computeBackoff(3, () => 0)).not.toBe(computeBackoff(3, () => 1));
  });

  it("treats a zero or negative attempt count as the first", () => {
    expect(computeBackoff(0, noJitter)).toBe(120);
    expect(computeBackoff(-5, noJitter)).toBe(120);
  });
});

describe("isLeaseStale", () => {
  const now = new Date("2026-11-21T12:00:00Z");

  it("holds a fresh claim", () => {
    const justNow = new Date(now.getTime() - 10_000);
    expect(isLeaseStale(justNow, now)).toBe(false);
  });

  it("holds a claim right up to the lease boundary", () => {
    const almost = new Date(now.getTime() - (LEASE_SECONDS * 1000 - 1));
    expect(isLeaseStale(almost, now)).toBe(false);
  });

  it("reclaims a claim at the lease boundary", () => {
    const exactly = new Date(now.getTime() - LEASE_SECONDS * 1000);
    expect(isLeaseStale(exactly, now)).toBe(true);
  });

  it("reclaims a long-abandoned claim", () => {
    const old = new Date(now.getTime() - 3_600_000);
    expect(isLeaseStale(old, now)).toBe(true);
  });

  it("reclaims a claim with no recorded attempt time", () => {
    // Only happens if the process died between the two writes of the
    // claim; stranding the credential forever would be worse.
    expect(isLeaseStale(null, now)).toBe(true);
  });
});

describe("budgetDocId", () => {
  it("formats as a chronologically sortable YYYY-MM-DD", () => {
    expect(budgetDocId(new Date("2026-11-21T15:00:00Z"))).toBe("2026-11-21");
  });

  it("uses Lima time, not UTC", () => {
    // 02:00Z on the 22nd is still 21:00 on the 21st in Lima (UTC-5). An
    // event running into the evening must not straddle two budget docs.
    expect(budgetDocId(new Date("2026-11-22T02:00:00Z"))).toBe("2026-11-21");
  });

  it("rolls over at Lima midnight", () => {
    expect(budgetDocId(new Date("2026-11-22T04:59:00Z"))).toBe("2026-11-21");
    expect(budgetDocId(new Date("2026-11-22T05:01:00Z"))).toBe("2026-11-22");
  });

  it("zero-pads single-digit months and days", () => {
    expect(budgetDocId(new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05");
  });
});

describe("remainingBudget", () => {
  it("reports the headroom left today", () => {
    expect(remainingBudget(100)).toBe(DAILY_CAP - 100);
  });

  it("returns zero at the cap", () => {
    expect(remainingBudget(DAILY_CAP)).toBe(0);
  });

  it("never goes negative past the cap", () => {
    expect(remainingBudget(DAILY_CAP + 50)).toBe(0);
  });

  it("ignores a nonsensical negative count", () => {
    expect(remainingBudget(-10)).toBe(DAILY_CAP);
  });
});

describe("hasAttemptsLeft", () => {
  it("allows retries below the ceiling", () => {
    expect(hasAttemptsLeft(0)).toBe(true);
    expect(hasAttemptsLeft(MAX_ATTEMPTS - 1)).toBe(true);
  });

  it("parks the document at the ceiling", () => {
    expect(hasAttemptsLeft(MAX_ATTEMPTS)).toBe(false);
    expect(hasAttemptsLeft(MAX_ATTEMPTS + 3)).toBe(false);
  });
});
