import { describe, expect, it } from "vitest";
import {
  getCreditWindowState,
  resolvePreviewTimeMs,
  splitCountdown,
} from "../gcpCreditsWindow";

const BOUNDS = {
  opensAt: "2026-11-28T08:00:00-05:00",
  creditsEndAt: "2026-11-28T20:00:00-05:00",
  viewClosesAt: "2026-11-28T22:00:00-05:00",
};

describe("getCreditWindowState", () => {
  it("stays in 'before' until 07:59:59 PET", () => {
    const state = getCreditWindowState(
      Date.parse("2026-11-28T07:59:59-05:00"),
      BOUNDS
    );
    expect(state.phase).toBe("before");
    expect(state.remainingMs).toBe(1000);
    expect(state.creditsProgressPercent).toBe(0);
  });

  it("opens exactly at 08:00:00 PET (13:00:00 UTC)", () => {
    const state = getCreditWindowState(
      Date.parse("2026-11-28T13:00:00Z"),
      BOUNDS
    );
    expect(state.phase).toBe("active");
    expect(state.remainingMs).toBe(12 * 3600 * 1000);
    expect(state.creditsProgressPercent).toBe(0);
  });

  it("reports 50% progress at 14:00:00 PET", () => {
    const state = getCreditWindowState(
      Date.parse("2026-11-28T14:00:00-05:00"),
      BOUNDS
    );
    expect(state.phase).toBe("active");
    expect(state.creditsProgressPercent).toBe(50);
  });

  it("switches to 'grace' at 20:00:00 PET while keeping the view open until 22:00 PET", () => {
    const state = getCreditWindowState(
      Date.parse("2026-11-28T20:00:00-05:00"),
      BOUNDS
    );
    expect(state.phase).toBe("grace");
    expect(state.remainingMs).toBe(2 * 3600 * 1000);
    expect(state.creditsProgressPercent).toBe(100);
  });

  it("stays in 'grace' at 21:59:59 PET", () => {
    const state = getCreditWindowState(
      Date.parse("2026-11-28T21:59:59-05:00"),
      BOUNDS
    );
    expect(state.phase).toBe("grace");
    expect(state.remainingMs).toBe(1000);
  });

  it("closes at 22:00:00 PET (2026-11-29T03:00:00Z)", () => {
    const state = getCreditWindowState(
      Date.parse("2026-11-29T03:00:00Z"),
      BOUNDS
    );
    expect(state.phase).toBe("closed");
    expect(state.remainingMs).toBe(0);
    expect(state.targetMs).toBeNull();
  });
});

describe("splitCountdown", () => {
  it("pads hours, minutes, and seconds and clamps negatives to zero", () => {
    expect(splitCountdown(0)).toEqual({
      hours: "00",
      minutes: "00",
      seconds: "00",
    });
    expect(splitCountdown(-5000)).toEqual({
      hours: "00",
      minutes: "00",
      seconds: "00",
    });
    expect(splitCountdown((2 * 3600 + 5 * 60 + 9) * 1000)).toEqual({
      hours: "02",
      minutes: "05",
      seconds: "09",
    });
  });
});

describe("resolvePreviewTimeMs", () => {
  it("always ignores ?at= outside development", () => {
    expect(
      resolvePreviewTimeMs("?at=2026-11-28T08:30:00-05:00", false)
    ).toBeNull();
  });

  it("parses valid ?at= ISO timestamp in development", () => {
    expect(resolvePreviewTimeMs("?at=2026-11-28T08:30:00-05:00", true)).toBe(
      Date.parse("2026-11-28T08:30:00-05:00")
    );
  });

  it("returns null on invalid timestamps in development", () => {
    expect(resolvePreviewTimeMs("?at=not-a-date", true)).toBeNull();
  });
});
