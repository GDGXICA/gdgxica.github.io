const firebaseConfig = {
  apiKey: "AIzaSyD0ilT28T2-5C1wU2zvCXkkqnhc7fPylVo",
  authDomain: "appgdgica.firebaseapp.com",
  projectId: "appgdgica",
  storageBucket: "appgdgica.firebasestorage.app",
  messagingSenderId: "647264238138",
  appId: "1:647264238138:web:68e7e6fb13454092801303",
};

let _app: import("firebase/app").FirebaseApp | null = null;

async function getApp() {
  if (!_app) {
    const { initializeApp, getApps } = await import("firebase/app");
    _app =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return _app;
}

export async function getAuth() {
  const app = await getApp();
  const { getAuth: firebaseGetAuth } = await import("firebase/auth");
  return firebaseGetAuth(app);
}

export async function getFirestore() {
  const app = await getApp();
  const { getFirestore: firebaseGetFirestore } = await import(
    "firebase/firestore"
  );
  return firebaseGetFirestore(app);
}
