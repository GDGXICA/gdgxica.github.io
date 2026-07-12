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

export async function getAuth() {
  const app = await getApp();
  const { getAuth: firebaseGetAuth } = await import("firebase/auth");
  const auth = firebaseGetAuth(app);
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
