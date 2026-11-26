import { describe, expect, it } from "vitest";
import {
  anyAssignmentGrants,
  eventPermissions,
  type MyAssignment,
} from "../useMyAssignments";

const volunteer = { role: "volunteer", status: "active" };

const assignments: MyAssignment[] = [
  { eventSlug: "a", role: "volunteer", permissions: ["mural:moderate"] },
  { eventSlug: "b", role: "volunteer", permissions: null },
];

describe("eventPermissions", () => {
  it("gives only what that event's assignment grants", () => {
    expect([...eventPermissions(volunteer, assignments, "a")]).toEqual([
      "mural:moderate",
    ]);
  });

  it("gives the whole bundle for an assignment without a list", () => {
    const perms = eventPermissions(volunteer, assignments, "b");
    expect(perms.has("checkin:operate")).toBe(true);
    expect(perms.has("mural:moderate")).toBe(true);
  });

  it("gives nothing where there is no assignment", () => {
    expect(eventPermissions(volunteer, assignments, "c").size).toBe(0);
    expect(eventPermissions(null, assignments, "a").size).toBe(0);
  });

  it("keeps an organizer's global permissions everywhere", () => {
    expect(
      eventPermissions({ role: "organizer" }, [], "c").has("checkin:operate")
    ).toBe(true);
  });
});

describe("anyAssignmentGrants", () => {
  it("looks across assignments", () => {
    const onlyMural = assignments.slice(0, 1);
    expect(anyAssignmentGrants(volunteer, onlyMural, "mural:moderate")).toBe(
      true
    );
    expect(anyAssignmentGrants(volunteer, onlyMural, "roster:read")).toBe(
      false
    );
    expect(anyAssignmentGrants(volunteer, null, "mural:moderate")).toBe(false);
  });
});
