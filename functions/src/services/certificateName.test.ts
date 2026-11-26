import { describe, expect, it } from "vitest";
import { cleanNamePart, displayName, fixNameCase } from "./certificateName";

describe("fixNameCase", () => {
  it("title-cases a name typed all in upper case", () => {
    expect(fixNameCase("MARÍA JOSÉ ÑAHUI QUISPE")).toBe(
      "María José Ñahui Quispe"
    );
  });

  it("title-cases a name typed all in lower case", () => {
    expect(fixNameCase("maría josé ñahui quispe")).toBe(
      "María José Ñahui Quispe"
    );
  });

  it("keeps Spanish particles lowercase except at the start", () => {
    expect(fixNameCase("JUAN DE LA CRUZ Y DEL RÍO")).toBe(
      "Juan de la Cruz y del Río"
    );
    expect(fixNameCase("de la cruz ana")).toBe("De la Cruz Ana");
  });

  it("capitalizes after apostrophes and hyphens", () => {
    expect(fixNameCase("SEAN O'BRIEN")).toBe("Sean O'Brien");
    expect(fixNameCase("ana-lucía pérez-soto")).toBe("Ana-Lucía Pérez-Soto");
  });

  it("leaves mixed case alone", () => {
    expect(fixNameCase("Ronald McDonald")).toBe("Ronald McDonald");
    expect(fixNameCase("maría José")).toBe("maría José");
  });

  it("leaves strings without letters alone", () => {
    expect(fixNameCase("  123 ")).toBe("123");
  });
});

describe("displayName", () => {
  it("joins first and last name with single spaces", () => {
    expect(displayName("  Ana  María ", " Torres\tRuiz ")).toBe(
      "Ana María Torres Ruiz"
    );
  });

  it("does not repeat a last name already in the first name", () => {
    expect(displayName("Ana Torres", "Torres")).toBe("Ana Torres");
    expect(displayName("ANA TORRES", "torres")).toBe("Ana Torres");
  });

  it("re-cases each part on its own", () => {
    expect(displayName("ANA LUCÍA", "Torres")).toBe("Ana Lucía Torres");
    expect(displayName("Juan", "DE LA CRUZ")).toBe("Juan de la Cruz");
    expect(displayName("juan", "McDonald")).toBe("Juan McDonald");
  });

  it("only treats a whole trailing word as a repeated last name", () => {
    expect(displayName("Martin", "Tin")).toBe("Martin Tin");
  });

  it("works with only one of the two parts", () => {
    expect(displayName("", "QUISPE")).toBe("Quispe");
    expect(displayName("Ana", "")).toBe("Ana");
  });

  it("normalizes to NFC", () => {
    const decomposed = "José";
    expect(displayName(decomposed, "")).toBe("José");
    expect(cleanNamePart(decomposed)).toBe("José");
  });
});
