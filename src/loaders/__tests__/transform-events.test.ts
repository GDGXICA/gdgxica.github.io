import { describe, expect, it, vi, beforeEach } from "vitest";

// Only fetchGdgData is stubbed; the real stripDomain / formatSpanishDate /
// expandCategory / expandStatus keep running, so this exercises the actual
// transform rather than a hollowed-out copy of it.
const mocks = vi.hoisted(() => ({ fetchGdgData: vi.fn() }));

vi.mock("../fetch-gdg-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fetch-gdg-data")>();
  return { ...actual, fetchGdgData: mocks.fetchGdgData };
});

import { loadEvents } from "../transform-events";

const BASE_EVENT = {
  id: "devfest-2026",
  title: "DevFest ICA 2026",
  description: "",
  short_description: "",
  date: "2026-11-21T09:00:00",
  end_time: "2026-11-21T18:00:00",
  venue: "",
  venue_address: "",
  venue_map_url: "",
  image_url: "",
  topics: [],
  speaker_names: [],
  speaker_ids: [],
  registration_url: null,
  is_virtual: false,
  is_highlight: false,
  participants: 0,
  max_participants: 350,
  category: "devfest",
  status: "upcoming",
  materials: {},
  requirements: [],
  includes: [],
  agenda: [],
};

/** Wires the two index fetches plus one event detail fetch. */
function stubDataRepo(event: Record<string, unknown>) {
  mocks.fetchGdgData.mockImplementation((path: string) => {
    if (path === "events/index.json")
      return Promise.resolve([{ id: event.id }]);
    if (path === "speakers/index.json") return Promise.resolve([]);
    return Promise.resolve(event);
  });
}

describe("loadEvents — credential block", () => {
  beforeEach(() => {
    mocks.fetchGdgData.mockReset();
  });

  it("leaves credential undefined when the event JSON omits it", async () => {
    stubDataRepo(BASE_EVENT);
    const [event] = await loadEvents();
    // Undefined rather than a disabled stub: the content schema marks it
    // .optional(), and getStaticPaths treats absence as "no such route".
    expect(event.credential).toBeUndefined();
  });

  it("maps group_letters to groupLetters and passes the rest through", async () => {
    stubDataRepo({
      ...BASE_EVENT,
      credential: {
        enabled: true,
        headline: "Soy parte del DevFest ICA 2026",
        group_letters: ["A", "Q", "I", "C"],
      },
    });
    const [event] = await loadEvents();
    expect(event.credential).toEqual({
      enabled: true,
      headline: "Soy parte del DevFest ICA 2026",
      groupLetters: ["A", "Q", "I", "C"],
    });
  });

  it("defaults enabled to false when the block omits it", async () => {
    stubDataRepo({ ...BASE_EVENT, credential: { headline: "Hola" } });
    const [event] = await loadEvents();
    expect(event.credential?.enabled).toBe(false);
  });

  it("derives a headline from the event title when none is given", async () => {
    stubDataRepo({ ...BASE_EVENT, credential: { enabled: true } });
    const [event] = await loadEvents();
    expect(event.credential?.headline).toBe("Soy parte de DevFest ICA 2026");
  });

  it("falls back to default letters when group_letters is empty", async () => {
    stubDataRepo({
      ...BASE_EVENT,
      credential: { enabled: true, group_letters: [] },
    });
    const [event] = await loadEvents();
    // An empty array would make letterForSequence divide by zero, so the
    // loader never lets one reach the schema.
    expect(event.credential?.groupLetters).toEqual(["A", "B", "C", "D"]);
  });
});
