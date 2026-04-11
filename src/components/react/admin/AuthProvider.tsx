import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { User } from "firebase/auth";
import {
  signIn as firebaseSignIn,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getUserRole,
} from "@/lib/auth";
import { api } from "@/lib/api";

const SESSION_KEY = "admin_session_start";
const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours

interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isOrganizer: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  isOrganizer: false,
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Check session expiry
        const sessionStart = localStorage.getItem(SESSION_KEY);
        if (
          sessionStart &&
          Date.now() - parseInt(sessionStart) > SESSION_DURATION
        ) {
          localStorage.removeItem(SESSION_KEY);
          await firebaseSignOut();
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        // Set session start if not set (e.g. page reload with valid session)
        if (!sessionStart) {
          localStorage.setItem(SESSION_KEY, Date.now().toString());
        }

        setUser(firebaseUser);
        try {
          const userRole = await getUserRole(firebaseUser.uid);
          if (userRole) {
            setRole(userRole);
          } else {
            await api.register();
            const newRole = await getUserRole(firebaseUser.uid);
            setRole(newRole || "member");
          }
        } catch {
          setRole("member");
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    await firebaseSignOut();
    setRole(null);
  }, []);

  const signIn = async () => {
    await firebaseSignIn();
    localStorage.setItem(SESSION_KEY, Date.now().toString());
  };

  const isOrganizer = role === "organizer" || role === "admin";
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider
      value={{ user, role, loading, signIn, signOut, isOrganizer, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}
