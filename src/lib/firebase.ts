const firebaseConfig = {
  apiKey: "AIzaSyD0ilT28T2-5C1wU2zvCXkkqnhc7fPylVo",
  authDomain: "appgdgica.firebaseapp.com",
  projectId: "appgdgica",
  storageBucket: "appgdgica.firebasestorage.app",
  messagingSenderId: "647264238138",
  appId: "1:647264238138:web:68e7e6fb13454092801303",
};

let _appPromise: Promise<import("firebase/app").FirebaseApp> | null = null;

function getApp() {
  if (!_appPromise) {
    _appPromise = (async () => {
      const { initializeApp, getApps } = await import("firebase/app");
      return getApps().length === 0
        ? initializeApp(firebaseConfig)
        : getApps()[0];
    })();
  }
  return _appPromise;
}

const USE_EMULATOR = import.meta.env.PUBLIC_USE_FIREBASE_EMULATOR === "true";
let _authEmulatorConnected = false;
let _dbPromise: Promise<import("firebase/firestore").Firestore> | null = null;

export async function getAuth() {
  const app = await getApp();
  const { getAuth: firebaseGetAuth, connectAuthEmulator } =
    await import("firebase/auth");
  const auth = firebaseGetAuth(app);
  if (USE_EMULATOR && !_authEmulatorConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    _authEmulatorConnected = true;
  }
  await auth.authStateReady();
  return auth;
}

// Memoized: initializeFirestore() must be the first Firestore call on the
// app instance, and it throws "already started" on the second. Memoizing
// the db promise (not just the app) is what guarantees it runs once.
export async function getFirestore() {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const app = await getApp();
      const {
        initializeFirestore,
        getFirestore: firebaseGetFirestore,
        persistentLocalCache,
        persistentMultipleTabManager,
        connectFirestoreEmulator,
      } = await import("firebase/firestore");

      // Offline persistence keeps the check-in panel usable on venue wifi:
      // the SDK queues writes in IndexedDB and replays them on reconnect.
      // The multi-tab manager is not optional — a second tab otherwise
      // fails to take the IndexedDB lock and silently degrades to an
      // in-memory cache, which would drop queued check-ins.
      let db: import("firebase/firestore").Firestore;
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        // Throws in Safari private mode (no IndexedDB) and if something
        // already started Firestore. This helper is on the critical path
        // for the public mini-game islands, so degrade instead of break.
        db = firebaseGetFirestore(app);
      }

      if (USE_EMULATOR) {
        connectFirestoreEmulator(db, "127.0.0.1", 8080);
      }
      return db;
    })();

    // Memoizing a promise also memoizes its rejection. Without this, one
    // transient failure (a chunk that fails to load on flaky wifi) would
    // leave every later call rejecting for the lifetime of the page —
    // permanently breaking the public mini-game islands that share this
    // helper. Clearing the slot lets the next caller retry, which is how
    // this behaved before it was memoized.
    _dbPromise.catch(() => {
      _dbPromise = null;
    });
  }
  return _dbPromise;
}

// Used by the public event island in PR4. No-ops when there is already
// a signed-in user (e.g. an admin opening the participant page in the
// same browser as their Google session) so we never clobber that.
export async function signInAnonymouslyIfNeeded() {
  const auth = await getAuth();
  if (auth.currentUser) return auth.currentUser;
  const { signInAnonymously } = await import("firebase/auth");
  const result = await signInAnonymously(auth);
  return result.user;
}
