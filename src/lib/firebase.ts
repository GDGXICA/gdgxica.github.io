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
let _firestoreEmulatorConnected = false;

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

export async function getFirestore() {
  const app = await getApp();
  const { getFirestore: firebaseGetFirestore, connectFirestoreEmulator } =
    await import("firebase/firestore");
  const db = firebaseGetFirestore(app);
  if (USE_EMULATOR && !_firestoreEmulatorConnected) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    _firestoreEmulatorConnected = true;
  }
  return db;
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
