import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    api
      .get("/users/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/customer/login", { email, password });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function register(name: string, email: string, password: string, phone?: string) {
    const { data } = await api.post("/auth/register", { name, email, password, phone });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function logout() {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    setUser(null);
    if (refreshToken) await api.post("/auth/logout", { refreshToken }).catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
