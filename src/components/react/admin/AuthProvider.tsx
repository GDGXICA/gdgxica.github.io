import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  signIn as firebaseSignIn,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getUserRole,
} from "@/lib/auth";
import { api } from "@/lib/api";

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
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const res = await api.register();
          if (res.success && res.data) {
            const userData = res.data as { role?: string };
            setRole(userData.role || "member");
          } else {
            const userRole = await getUserRole(firebaseUser.uid);
            setRole(userRole || "member");
          }
        } catch {
          setRole("member");
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    await firebaseSignIn();
  };

  const signOut = async () => {
    await firebaseSignOut();
    setRole(null);
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
