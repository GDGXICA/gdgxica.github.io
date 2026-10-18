import { describe, expect, it } from "vitest";
import {
  INVALID_INVITATION,
  accessError,
  formatWhen,
  redeemError,
  splitLinks,
} from "../copy";

describe("accessError", () => {
  it("translates the messages the access API sends", () => {
    expect(accessError("Request was already reviewed", "x")).toBe(
      "Otra persona ya decidió sobre esta solicitud. Vuelve a cargar la lista."
    );
    expect(
      accessError("role must be one of: contributor, volunteer", "x")
    ).toBe("Elige uno de los roles de la lista.");
  });

  it("falls back for generic server failures", () => {
    expect(accessError("An internal error occurred", "Reintenta")).toBe(
      "Reintenta"
    );
    expect(accessError("Error 502", "Reintenta")).toBe("Reintenta");
    expect(accessError(undefined, "Reintenta")).toBe("Reintenta");
  });

  it("keeps messages that are already in Spanish", () => {
    expect(accessError("No se pudo conectar con el servidor.", "x")).toBe(
      "No se pudo conectar con el servidor."
    );
  });
});

describe("redeemError", () => {
  it("shows one message for every invalid redemption", () => {
    expect(redeemError("Invitation is invalid, expired or already used")).toBe(
      INVALID_INVITATION
    );
    expect(INVALID_INVITATION).not.toMatch(/revoc|otra cuenta|no es tuya/i);
  });
});

describe("formatWhen", () => {
  const now = Date.UTC(2026, 9, 18, 15);

  it("speaks in relative terms within a week", () => {
    expect(formatWhen(now - 3 * 3600_000, now)).toBe("hace 3 horas");
    expect(formatWhen(now - 86400_000, now)).toBe("ayer");
    expect(formatWhen(now + 10 * 86400_000, now)).toMatch(/2026/);
    expect(formatWhen(null, now)).toBe("sin fecha");
  });
});

describe("splitLinks", () => {
  it("turns only http(s) addresses into links", () => {
    expect(
      splitLinks("https://github.com/ana, javascript:alert(1) portafolio")
    ).toEqual([
      { text: "https://github.com/ana", href: "https://github.com/ana" },
      { text: ", " },
      { text: "javascript:alert(1)" },
      { text: " " },
      { text: "portafolio" },
    ]);
  });
});
