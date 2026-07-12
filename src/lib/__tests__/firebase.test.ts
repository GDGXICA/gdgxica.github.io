import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ __app: true })),
  getApps: vi.fn(() => []),
  getAuth: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  initializeApp: mocks.initializeApp,
  getApps: mocks.getApps,
}));

vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  signInAnonymously: mocks.signInAnonymously,
}));

function buildAuth(options: {
  currentUser: { uid: string } | null;
  authStateReady?: () => Promise<void>;
}) {
  return {
    currentUser: options.currentUser,
    authStateReady: options.authStateReady ?? vi.fn(async () => undefined),
  };
}

describe("firebase.ts auth readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.initializeApp.mockClear();
    mocks.getApps.mockClear().mockReturnValue([]);
    mocks.getAuth.mockClear();
    mocks.signInAnonymously.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("getAuth awaits authStateReady before returning", async () => {
    const authStateReady = vi.fn(async () => undefined);
    mocks.getAuth.mockReturnValue(
      buildAuth({ currentUser: null, authStateReady })
    );

    const { getAuth } = await import("../firebase");
    await getAuth();

    expect(authStateReady).toHaveBeenCalledTimes(1);
  });

  it("signInAnonymouslyIfNeeded does not sign in anonymously when a persisted session resolves after authStateReady (the cross-tab race)", async () => {
    // Simulates the reported bug: currentUser is only populated once the
    // SDK finishes rehydrating persisted (IndexedDB) auth state, which
    // authStateReady() waits for.
    const persistedUser = { uid: "admin-uid" };
    const auth = buildAuth({
      currentUser: null,
      authStateReady: vi.fn(async () => {
        auth.currentUser = persistedUser;
      }),
    });
    mocks.getAuth.mockReturnValue(auth);

    const { signInAnonymouslyIfNeeded } = await import("../firebase");
    const user = await signInAnonymouslyIfNeeded();

    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(user).toBe(persistedUser);
  });

  it("signInAnonymouslyIfNeeded still signs in anonymously for a genuinely new participant", async () => {
    mocks.getAuth.mockReturnValue(buildAuth({ currentUser: null }));
    mocks.signInAnonymously.mockResolvedValue({
      user: { uid: "anon-uid" },
    });

    const { signInAnonymouslyIfNeeded } = await import("../firebase");
    const user = await signInAnonymouslyIfNeeded();

    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(user).toEqual({ uid: "anon-uid" });
  });
});
