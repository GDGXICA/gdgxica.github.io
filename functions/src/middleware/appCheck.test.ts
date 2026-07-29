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

import { verifyAppCheck } from "./appCheck";

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

  it("fails open when the setting cannot be read", async () => {
    // A Firestore hiccup must not close public registration. The endpoint
    // still has its per-IP limit and its per-event cap.
    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement("error");
    const next = vi.fn();
    const res = buildRes();
    await verifyAppCheck()(buildReq("bad-token"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.__status).toBeUndefined();
  });

  it("treats a missing enforce field as unenforced", async () => {
    mocks.verifyToken.mockRejectedValue(new Error("bad"));
    enforcement(undefined);
    const next = vi.fn();
    await verifyAppCheck()(buildReq("bad-token"), buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
