// One colour code per event category and status, shared by every place that
// marks them with a dot (Tag chips, the event filters, the home event log) so
// the same category never shows two colours on the site. The four Google
// colours are codes here, not decoration; Women Techmakers keeps its own
// violet and hackathons an orange. Values are CSS colours, mostly the night
// theme's variables, so they only resolve inside `.theme-night`.

export const CATEGORY_DOT: Record<string, string> = {
  devfest: "var(--g-blue)",
  io: "var(--g-red)",
  studyjam: "var(--g-green)",
  wtm: "#b98cff",
  meetup: "var(--g-yellow)",
  hackaton: "#f08a3c",
};

export const STATUS_DOT: Record<string, string> = {
  upcoming: "var(--ochre)",
  "in-progress": "var(--g-blue)",
  completed: "var(--muted)",
};

/** The dot colour for a category or status, or undefined if it has none. */
export function dotColor(type: string | undefined): string | undefined {
  if (!type) return undefined;
  return CATEGORY_DOT[type] ?? STATUS_DOT[type];
}
