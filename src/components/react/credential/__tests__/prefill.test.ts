import { describe, expect, it } from "vitest";
import { nameFromQuery } from "../prefill";

describe("nameFromQuery", () => {
  it("splits the first word from the rest", () => {
    expect(nameFromQuery("?nombre=Mar%C3%ADa+Jos%C3%A9+Quispe")).toEqual({
      firstName: "María",
      lastName: "José Quispe",
    });
  });

  it("keeps a single name as the first name", () => {
    expect(nameFromQuery("?nombre=Ana")).toEqual({
      firstName: "Ana",
      lastName: "",
    });
  });

  it("collapses whitespace", () => {
    expect(nameFromQuery("?nombre=%20%20Luis%20%20%20Mercado%20")).toEqual({
      firstName: "Luis",
      lastName: "Mercado",
    });
  });

  it("returns null without a usable name", () => {
    expect(nameFromQuery("")).toBeNull();
    expect(nameFromQuery("?nombre=")).toBeNull();
    expect(nameFromQuery("?nombre=%20%20")).toBeNull();
    expect(nameFromQuery("?otro=Ana")).toBeNull();
  });

  it("caps each part at the server limit", () => {
    const long = "a".repeat(80);
    const result = nameFromQuery(`?nombre=${long}+${long}`);
    expect(result?.firstName).toHaveLength(60);
    expect(result?.lastName).toHaveLength(60);
  });
});
