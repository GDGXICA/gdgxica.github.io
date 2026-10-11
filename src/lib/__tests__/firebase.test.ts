import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ __app: true })),
  getApps: vi.fn(() => []),
  getAuth: vi.fn(),
  signInAnonymously: vi.fn(),
  connectAuthEmulator: vi.fn(),
  initializeFirestore: vi.fn(() => ({ __db: true })),
  getFirestore: vi.fn(),
  persistentLocalCache: vi.fn(() => ({ kind: "persistent" })),
  persistentMultipleTabManager: vi.fn(() => ({ kind: "multi-tab" })),
  memoryLocalCache: vi.fn(() => ({ kind: "memory" })),
  connectFirestoreEmulator: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  initializeApp: mocks.initializeApp,
  getApps: mocks.getApps,
}));

vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  signInAnonymously: mocks.signInAnonymously,
  connectAuthEmulator: mocks.connectAuthEmulator,
}));

vi.mock("firebase/firestore", () => ({
  initializeFirestore: mocks.initializeFirestore,
  getFirestore: mocks.getFirestore,
  persistentLocalCache: mocks.persistentLocalCache,
  persistentMultipleTabManager: mocks.persistentMultipleTabManager,
  memoryLocalCache: mocks.memoryLocalCache,
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
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

describe("firebase.ts Firestore cache", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.initializeFirestore.mockClear();
    mocks.persistentLocalCache.mockClear();
    mocks.persistentMultipleTabManager.mockClear();
    mocks.memoryLocalCache.mockClear();
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("keeps a public page out of the cache shared between tabs", async () => {
    window.history.replaceState(null, "", "/events/devfest-2025/mural/");

    const { getFirestore } = await import("../firebase");
    await getFirestore();

    expect(mocks.persistentLocalCache).not.toHaveBeenCalled();
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      localCache: { kind: "memory" },
    });
  });

  it("keeps the persistent multi-tab cache on admin pages", async () => {
    window.history.replaceState(null, "", "/admin/checkin");

    const { getFirestore } = await import("../firebase");
    await getFirestore();

    expect(mocks.memoryLocalCache).not.toHaveBeenCalled();
    expect(mocks.persistentLocalCache).toHaveBeenCalledWith({
      tabManager: { kind: "multi-tab" },
    });
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
      localCache: { kind: "persistent" },
    });
  });
});
