import { describe, expect, it } from "vitest";
import { eventSchema } from "./index";

// The credential block is written by hand in the gdg-ica-data repo and
// round-trips through /admin/events untouched (EventForm spreads the
// loaded event into form state and back into the payload). eventSchema
// is .strict(), so without an entry for it every save of a credential
// -carrying event would 400. These tests pin that contract.

const MINIMAL_EVENT = { id: "devfest-2026", title: "DevFest ICA 2026" };

describe("eventSchema — credential block", () => {
  it("accepts an event with no credential block at all", () => {
    const r = eventSchema.safeParse({ ...MINIMAL_EVENT });
    expect(r.success).toBe(true);
    // Absent, not defaulted: every event published before this feature
    // lacks the key, and materializing one would rewrite their JSON.
    expect(r.success && r.data.credential).toBeUndefined();
  });

  it("accepts a fully specified credential block and preserves it", () => {
    const r = eventSchema.safeParse({
      ...MINIMAL_EVENT,
      credential: {
        enabled: true,
        headline: "Soy parte del DevFest ICA 2026",
        group_letters: ["A", "Q", "I", "C"],
      },
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.credential).toEqual({
      enabled: true,
      headline: "Soy parte del DevFest ICA 2026",
      group_letters: ["A", "Q", "I", "C"],
    });
  });

  it("fills credential defaults when the block is present but partial", () => {
    const r = eventSchema.safeParse({
      ...MINIMAL_EVENT,
      credential: { headline: "Soy parte" },
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.credential).toEqual({
      enabled: false,
      headline: "Soy parte",
      group_letters: [],
    });
  });

  it("rejects an unknown key inside credential", () => {
    const r = eventSchema.safeParse({
      ...MINIMAL_EVENT,
      credential: { enabled: true, mascots: ["gopher"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-boolean enabled", () => {
    const r = eventSchema.safeParse({
      ...MINIMAL_EVENT,
      credential: { enabled: "true" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects group letters longer than two characters", () => {
    const r = eventSchema.safeParse({
      ...MINIMAL_EVENT,
      credential: { enabled: true, group_letters: ["AAA"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty group letter", () => {
    const r = eventSchema.safeParse({
      ...MINIMAL_EVENT,
      credential: { enabled: true, group_letters: [""] },
    });
    expect(r.success).toBe(false);
  });

  it("still rejects unknown top-level keys", () => {
    const r = eventSchema.safeParse({ ...MINIMAL_EVENT, credencial: {} });
    expect(r.success).toBe(false);
  });
});
