import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  settingsGet: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  appCheck: () => ({ verifyToken: mocks.verifyToken }),
  firestore: () => ({
    collection: () => ({ doc: () => ({ get: mocks.settingsGet }) }),
  }),
}));

import {
  verifyAppCheck,
  readAppCheckEnforcement,
  __resetAppCheckCache,
} from "./appCheck";

function buildReq(token?: string): Request {
  return {
    path: "/api/events/devfest-2026/credentials",
    header: (name: string) =>
      name.toLowerCase() === "x-firebase-appcheck" ? token : undefined,
  } as unknown as Request;
}

interface ResMock extends Response {
  __status?: number;
  __body?: unknown;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = {};
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: unknown) {
    this.__body = body;
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

/** Sets what the enforcement document says. */
function enforcement(enforce: boolean | undefined | "error") {
  if (enforce === "error") {
    mocks.settingsGet.mockRejectedValue(new Error("firestore down"));
    return;
  }
  mocks.settingsGet.mockResolvedValue({ data: () => ({ enforce }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  // El valor cacheado vive en el módulo, así que sin esto un test que activa la
  // exigencia se la deja puesta al siguiente.
  __resetAppCheckCache();
});

describe("verifyAppCheck", () => {
  it("lets a valid token through without reading the setting", async () => {
    mocks.verifyToken.mockResolvedValue({ appId: "web" });
    const next = vi.fn();
    await verifyAppCheck()(buildReq("good-token"), buildRes(), next);

    expect(next).toHaveBeenCalledOnce();
    // The happy path must not pay for a Firestore read on every public
    // request.
    expect(mocks.settingsGet).not.toHaveBeenCalled();
  });

  it("allows an unverified request while enforcement is off", async () => {
    // The rollout starts unenforced on purpose: rejecting before the logs
    // show what real traffic looks like would cost registrations.
    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement(false);
    const next = vi.fn();
    const res = buildRes();
    await verifyAppCheck()(buildReq("bad-token"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.__status).toBeUndefined();
  });

  it("allows a request with no token at all while unenforced", async () => {
    enforcement(false);
    const next = vi.fn();
    await verifyAppCheck()(buildReq(undefined), buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an invalid token once enforcement is on", async () => {
    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement(true);
    const next = vi.fn();
    const res = buildRes();
    await verifyAppCheck()(buildReq("bad-token"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.__status).toBe(403);
  });

  it("rejects a missing token once enforcement is on", async () => {
    enforcement(true);
    const next = vi.fn();
    const res = buildRes();
    await verifyAppCheck()(buildReq(undefined), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.__status).toBe(403);
  });

  it("explains the refusal in Spanish and suggests an action", async () => {
    // A blocked legitimate visitor needs something to do, not a code.
    enforcement(true);
    const res = buildRes();
    await verifyAppCheck()(buildReq(undefined), res, vi.fn());

    const body = res.__body as { error: string };
    expect(body.error).toMatch(/recarga la página/i);
  });

  it("fails open when the setting cannot be read and nothing is cached", async () => {
    // With no known value there is nothing to fall back on, so a Firestore
    // hiccup must not close public registration. The endpoint still has its
    // per-IP limit and its per-event cap.
    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement("error");
    const next = vi.fn();
    const res = buildRes();
    await verifyAppCheck()(buildReq("bad-token"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.__status).toBeUndefined();
  });

  // This replaces the older blanket "a hiccup always fails open". That was a
  // hole: a Firestore blink silently switched App Check off and back on, so it
  // neither protected nor said it wasn't protecting.
  //
  // Keeping the last known value is safe because a VALID token never reads the
  // setting at all (see the first test). So this only affects requests that
  // already arrived without a usable App Check token — exactly the ones
  // enforcement exists to reject. Legitimate clients are untouched.
  it("keeps enforcing through a hiccup once the setting was read as on", async () => {
    enforcement(true);
    expect(await readAppCheckEnforcement()).toBe(true);

    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement("error");
    const next = vi.fn();
    const res = buildRes();
    await verifyAppCheck()(buildReq("bad-token"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.__status).toBe(403);
  });

  it("treats a missing enforce field as unenforced", async () => {
    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement(undefined);
    const next = vi.fn();
    await verifyAppCheck()(buildReq("bad-token"), buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});

/**
 * La caché del interruptor.
 *
 * La bandera vive en Firestore para poder apagarla sin desplegar si reCAPTCHA se
 * cae en mitad de un evento. Eso sigue funcionando; lo que cambia es qué pasa
 * cuando la LECTURA falla.
 */
describe("readAppCheckEnforcement", () => {
  it("reads the flag", async () => {
    enforcement(true);
    expect(await readAppCheckEnforcement()).toBe(true);
    enforcement(false);
    expect(await readAppCheckEnforcement()).toBe(false);
  });

  // Solo `true` exacto: un "true" de cadena en el documento no activa nada.
  it("only an exact boolean true enforces", async () => {
    mocks.settingsGet.mockResolvedValue({ data: () => ({ enforce: "true" }) });
    expect(await readAppCheckEnforcement()).toBe(false);
  });

  it("survives several consecutive read failures", async () => {
    enforcement(true);
    await readAppCheckEnforcement();
    enforcement("error");
    expect(await readAppCheckEnforcement()).toBe(true);
    expect(await readAppCheckEnforcement()).toBe(true);
    expect(await readAppCheckEnforcement()).toBe(true);
  });

  it("caches a known false too", async () => {
    enforcement(false);
    expect(await readAppCheckEnforcement()).toBe(false);
    enforcement("error");
    expect(await readAppCheckEnforcement()).toBe(false);
  });

  // El interruptor de emergencia sigue siendo inmediato: en cuanto la lectura
  // vuelve, manda el valor real y no el cacheado.
  it("returns to the real value once reads recover", async () => {
    enforcement(true);
    await readAppCheckEnforcement();
    enforcement("error");
    expect(await readAppCheckEnforcement()).toBe(true);
    enforcement(false);
    expect(await readAppCheckEnforcement()).toBe(false);
  });
});
