import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import type { User } from "firebase/auth";
import {
  signIn as firebaseSignIn,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getUserProfile,
} from "@/lib/auth";
import { api } from "@/lib/api";
import {
  canAccessPanel as evalCanAccessPanel,
  effectivePermissions,
  type Permission,
  type PermissionSubject,
} from "@/lib/permissions";

const SESSION_KEY = "admin_session_start";
const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours

interface AuthContextType {
  user: User | null;
  role: string | null;
  /** Doc `users/{uid}` completo, o `null` si aún no cargó. */
  profile: PermissionSubject | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * `true` si la persona tiene el permiso a alcance global.
   *
   * Para lo acotado a un evento no basta con esto: los permisos `perEvent`
   * dependen de la asignación de staff, que se comprueba en el servidor.
   * Aquí solo decidimos qué pintar.
   */
  can: (permission: Permission) => boolean;
  /** Permisos efectivos a alcance global. */
  permissions: ReadonlySet<Permission>;
  /** `true` si tiene algo que hacer dentro del panel. */
  canAccessPanel: boolean;
}

const EMPTY: ReadonlySet<Permission> = new Set();

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  can: () => false,
  permissions: EMPTY,
  canAccessPanel: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const profile: PermissionSubject = { role: "admin", status: "active" };
  const permissions = effectivePermissions(profile);

  const mockValue: AuthContextType = {
    user: {
      // uid is not decorative: any panel that attributes a write needs it,
      // and passing undefined into a Firestore field throws at runtime.
      uid: "dev-preview-uid",
      displayName: "Dev Preview",
      email: "dev@preview.local",
      photoURL: "",
    } as AuthContextType["user"],
    role: "admin",
    profile,
    loading: false,
    signIn: async () => {},
    signOut: async () => {},
    can: (permission) => permissions.has(permission),
    permissions,
    canAccessPanel: true,
  };

  return (
    <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PermissionSubject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Check session expiry
        const sessionStart = localStorage.getItem(SESSION_KEY);
        const startTime = sessionStart ? parseInt(sessionStart, 10) : 0;
        if (
          !Number.isFinite(startTime) ||
          startTime <= 0 ||
          Date.now() - startTime > SESSION_DURATION
        ) {
          localStorage.removeItem(SESSION_KEY);
          await firebaseSignOut();
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        // Set session start if not set (e.g. page reload with valid session)
        if (!sessionStart) {
          localStorage.setItem(SESSION_KEY, Date.now().toString());
        }

        setUser(firebaseUser);
        try {
          let loaded = await getUserProfile(firebaseUser.uid);
          if (!loaded) {
            // Primer inicio de sesión: se da de alta como `member`, que no
            // concede ningún permiso de panel.
            await api.register();
            loaded = await getUserProfile(firebaseUser.uid);
          }
          setProfile(loaded);
        } catch {
          // Si no se pudo leer el perfil, no asumimos nada: sin perfil no
          // hay permisos. Antes esto caía a "member", que daba igual porque
          // member no podía entrar; con permisos concedibles por usuario,
          // inventar un perfil sería inventar autorización.
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    await firebaseSignOut();
    setProfile(null);
  }, []);

  const signIn = async () => {
    // Must be set before the popup: Firebase fires onAuthStateChanged
    // inside signInWithPopup (before the promise resolves), and the
    // observer reads SESSION_KEY to decide whether the session is valid.
    localStorage.setItem(SESSION_KEY, Date.now().toString());
    try {
      await firebaseSignIn();
    } catch (err) {
      localStorage.removeItem(SESSION_KEY);
      throw err;
    }
  };

  const permissions = useMemo(
    () => (profile ? effectivePermissions(profile) : EMPTY),
    [profile]
  );
  const can = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        role: (profile?.role as string) ?? null,
        profile,
        loading,
        signIn,
        signOut,
        can,
        permissions,
        canAccessPanel: profile ? evalCanAccessPanel(profile) : false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
