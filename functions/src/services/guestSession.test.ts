import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  docMock: vi.fn(),
  logParticipantAudit: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: () => ({ doc: mocks.docMock }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

vi.mock("../utils/audit", () => ({
  logParticipantAudit: mocks.logParticipantAudit,
}));

import {
  __resetGuestSigningKeyCache,
  isGuestToken,
  issueGuestSession,
  verifyGuestToken,
} from "./guestSession";

describe("guestSession service", () => {
  beforeEach(() => {
    __resetGuestSigningKeyCache();
    mocks.docMock.mockReset();
    delete process.env.MINIGAME_GUEST_SECRET;
  });

  afterEach(() => {
    delete process.env.MINIGAME_GUEST_SECRET;
  });

  it("issues and verifies a signed guest token using persisted Firestore key", async () => {
    const storedKey = "a".repeat(64);
    mocks.docMock.mockReturnValue({
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ signingKeyHex: storedKey }),
      })),
    });

    const session = await issueGuestSession(1_000_000);
    expect(session.uid).toMatch(/^g_[A-Za-z0-9_-]+$/);
    expect(isGuestToken(session.token)).toBe(true);

    const verified = await verifyGuestToken(session.token, 1_000_500);
    expect(verified).toEqual({ uid: session.uid });
  });

  it("rejects tampered signatures and expired tokens", async () => {
    process.env.MINIGAME_GUEST_SECRET =
      "super-secret-minigame-signing-key-for-tests-123456";

    const session = await issueGuestSession(1_000_000);
    const tampered = `${session.token.slice(0, -2)}xx`;
    expect(await verifyGuestToken(tampered, 1_000_500)).toBeNull();
    expect(
      await verifyGuestToken(session.token, session.expiresAt + 1)
    ).toBeNull();
    expect(await verifyGuestToken("not-a-guest-token")).toBeNull();
  });

  it("creates the signing key atomically if the settings doc does not exist", async () => {
    const createMock = vi.fn(async () => undefined);
    mocks.docMock.mockReturnValue({
      get: vi.fn(async () => ({ exists: false, data: () => undefined })),
      create: createMock,
    });

    const session = await issueGuestSession(1_000_000);
    expect(createMock).toHaveBeenCalledTimes(1);
    const verified = await verifyGuestToken(session.token, 1_000_100);
    expect(verified).toEqual({ uid: session.uid });
  });
});
