import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  updateStats: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { getStats: mocks.getStats, updateStats: mocks.updateStats },
}));

import { StatsEditor } from "../StatsEditor";
import { changedFields, type Stats } from "../fields";

const STATS: Stats = {
  total_members: 1000,
  total_events: 50,
  total_talks: 32,
  total_speakers: 25,
  years_active: 10,
  total_organizers: 7,
  developers_mentored: 200,
  total_sponsors: 15,
  annual_support: "$50k",
  sponsored_events: 100,
  developers_reached: 5000,
  active_volunteers: 50,
  volunteer_hours: 1500,
  events_supported: 100,
  volunteer_areas: 9,
  updated_at: "2026-10-01T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("changedFields", () => {
  it("lists only the fields whose value differs", () => {
    const fields = changedFields(STATS, {
      ...STATS,
      years_active: 11,
      updated_at: "otra",
    });
    expect(fields.map((f) => f.key)).toEqual(["years_active"]);
  });
});

describe("StatsEditor", () => {
  it("keeps saving disabled until a number changes, then sends the edit", async () => {
    mocks.getStats.mockResolvedValue({ success: true, data: STATS });
    mocks.updateStats.mockResolvedValue({
      success: true,
      data: { ...STATS, years_active: 11 },
    });
    const user = userEvent.setup();
    render(<StatsEditor />);

    const years = await screen.findByLabelText("Años activos");
    expect(screen.getByLabelText("Áreas de apoyo")).toHaveValue(9);
    const save = screen.getByRole("button", { name: "Guardar cifras" });
    expect(save).toBeDisabled();

    await user.clear(years);
    await user.type(years, "11");
    await user.click(screen.getByRole("button", { name: "Guardar 1 cambio" }));

    expect(mocks.updateStats).toHaveBeenCalledWith({
      ...STATS,
      years_active: 11,
    });
    expect(
      await screen.findByRole("button", { name: "Guardar cifras" })
    ).toBeDisabled();
  });

  it("offers a retry when the numbers cannot be loaded", async () => {
    mocks.getStats.mockResolvedValueOnce({ success: false, error: "boom" });
    mocks.getStats.mockResolvedValueOnce({ success: true, data: STATS });
    const user = userEvent.setup();
    render(<StatsEditor />);

    await user.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByLabelText("Miembros activos")).toHaveValue(1000);
  });
});
