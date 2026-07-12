const firebaseConfig = {
  apiKey: "AIzaSyD0ilT28T2-5C1wU2zvCXkkqnhc7fPylVo",
  authDomain: "appgdgica.firebaseapp.com",
  projectId: "appgdgica",
  storageBucket: "appgdgica.firebasestorage.app",
  messagingSenderId: "647264238138",
  appId: "1:647264238138:web:68e7e6fb13454092801303",
};

let _appPromise: Promise<import("firebase/app").FirebaseApp> | null = null;

// Cache the in-flight promise, not just the resolved app: two callers
// invoking getApp() before the first `await import("firebase/app")`
// settles would otherwise both see no cached app yet, and could both call
// initializeApp(), which throws "Firebase App named '[DEFAULT]' already
// exists" on the second call.
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

export async function getAuth() {
  const app = await getApp();
  const { getAuth: firebaseGetAuth } = await import("firebase/auth");
  const auth = firebaseGetAuth(app);
  // Wait for the SDK to finish restoring any persisted session (IndexedDB)
  // before callers read `auth.currentUser`. Without this, a fresh tab can
  // observe `currentUser` as null before rehydration completes and sign in
  // anonymously (see signInAnonymouslyIfNeeded below), which — because auth
  // state syncs across same-origin tabs — silently clobbers an existing
  // signed-in session (e.g. an admin's) in every open tab.
  await auth.authStateReady();
  return auth;
}

export async function getFirestore() {
  const app = await getApp();
  const { getFirestore: firebaseGetFirestore } =
    await import("firebase/firestore");
  return firebaseGetFirestore(app);
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
