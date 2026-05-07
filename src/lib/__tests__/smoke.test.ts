import { describe, expect, it } from "vitest";

describe("test infrastructure smoke", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("supports async test execution", async () => {
    const value = await Promise.resolve("ok");
    expect(value).toBe("ok");
  });
});
