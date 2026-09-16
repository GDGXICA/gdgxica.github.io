import { describe, expect, it } from "vitest";
import {
  DEFAULT_MURAL_SETTINGS,
  readMuralSettings,
  remainingQuota,
  type MuralPhoto,
} from "../mural";

describe("readMuralSettings", () => {
  it("lee un documento bien formado", () => {
    expect(
      readMuralSettings({
        state: "open",
        maxPerUid: 5,
        maxTotal: 900,
        acceptedTotal: 42,
        headline: "Sube tus fotos",
      })
    ).toEqual({
      state: "open",
      maxPerUid: 5,
      maxTotal: 900,
      acceptedTotal: 42,
      headline: "Sube tus fotos",
    });
  });

  it("acepta el estado de pausa", () => {
    expect(readMuralSettings({ state: "paused" }).state).toBe("paused");
  });

  describe("la ausencia nunca abre", () => {
    it("un documento que no existe deja el mural cerrado", () => {
      expect(readMuralSettings(undefined).state).toBe("closed");
      expect(readMuralSettings(null).state).toBe("closed");
      expect(readMuralSettings({}).state).toBe("closed");
    });

    it("un estado desconocido deja el mural cerrado", () => {
      expect(readMuralSettings({ state: "abierto" }).state).toBe("closed");
      expect(readMuralSettings({ state: "OPEN" }).state).toBe("closed");
      expect(readMuralSettings({ state: true }).state).toBe("closed");
      expect(readMuralSettings({ state: 1 }).state).toBe("closed");
    });
  });

  it("cae a los valores por defecto cuando un tope no es un número", () => {
    const settings = readMuralSettings({ maxPerUid: "10", maxTotal: null });
    expect(settings.maxPerUid).toBe(DEFAULT_MURAL_SETTINGS.maxPerUid);
    expect(settings.maxTotal).toBe(DEFAULT_MURAL_SETTINGS.maxTotal);
  });

  it("un contador ausente vale cero, no NaN", () => {
    expect(readMuralSettings({ state: "open" }).acceptedTotal).toBe(0);
  });
});

describe("remainingQuota", () => {
  function photo(status: MuralPhoto["status"]): MuralPhoto {
    return {
      id: Math.random().toString(36).slice(2),
      eventSlug: "e",
      status,
      uid: "anon-1",
      alias: "",
      storagePath: null,
      downloadUrl: null,
      width: 1,
      height: 1,
      bytes: 1,
      createdAt: null,
      approvedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: "",
      removalRequestedAt: null,
      removalRequestNote: "",
      removedReason: null,
    };
  }

  it("descuenta lo ya subido", () => {
    expect(remainingQuota([photo("pending"), photo("approved")], 10)).toBe(8);
  });

  it("las rechazadas y las retiradas SIGUEN contando", () => {
    expect(remainingQuota([photo("rejected"), photo("removed")], 10)).toBe(8);
  });

  it("nunca baja de cero", () => {
    const mine = [photo("approved"), photo("approved"), photo("approved")];
    expect(remainingQuota(mine, 2)).toBe(0);
  });

  it("sin fotos queda la cuota entera", () => {
    expect(remainingQuota([], 10)).toBe(10);
  });
});
