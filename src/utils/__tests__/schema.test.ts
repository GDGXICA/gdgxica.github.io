import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../schema";

describe("serializeJsonLd", () => {
  const hostile = {
    "@type": "Event",
    name: "DevFest </script><script>alert(1)</script>",
    description: "<!-- <script>",
    performer: [{ name: "</SCRIPT >" }],
  };

  it("cannot end the script element it is written into", () => {
    const out = serializeJsonLd(hostile);

    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain("<!--");
  });

  it("round-trips to the same data, so the structured data is unchanged", () => {
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
  });
});
