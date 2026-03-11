import { createContext, useContext, useState, useCallback } from "react";
import { setSharedToken } from "@/lib/queryClient";

interface AuthState {
  token: string | null;
  username: string | null;
  isAdmin: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Token lives in React state only (in-memory). Works perfectly on Render —
  // persists for the duration of the browser tab session.
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    username: null,
    isAdmin: false,
  });

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    setSharedToken(data.token);
    setAuth({ token: data.token, username: data.username, isAdmin: true });
  }, []);

  const logout = useCallback(async () => {
    if (auth.token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
      }).catch(() => {});
    }
    setSharedToken(null);
    setAuth({ token: null, username: null, isAdmin: false });
  }, [auth.token]);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
