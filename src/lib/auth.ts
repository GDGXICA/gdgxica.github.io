import type { User } from "firebase/auth";
import { getAuth, getFirestore } from "./firebase";

export async function signIn() {
  const auth = await getAuth();
  const { signInWithPopup, GoogleAuthProvider } = await import("firebase/auth");
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOut() {
  const auth = await getAuth();
  const { signOut: firebaseSignOut } = await import("firebase/auth");
  return firebaseSignOut(auth);
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  getAuth().then(async (auth) => {
    const { onAuthStateChanged: firebaseOnAuthStateChanged } =
      await import("firebase/auth");
    // El consumidor pudo desmontarse antes de que resolviera getAuth():
    // evita suscribirse (y fugar el listener) si ya se llamó al cleanup.
    if (cancelled) return;
    unsubscribe = firebaseOnAuthStateChanged(auth, callback);
  });
  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

export async function getIdToken(): Promise<string | null> {
  const auth = await getAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function getUserRole(uid: string): Promise<string | null> {
  const db = await getFirestore();
  const { doc, getDoc } = await import("firebase/firestore");
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return null;
  return userDoc.data().role as string;
}
