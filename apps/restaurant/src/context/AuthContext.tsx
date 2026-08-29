import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";
import { disconnectSocket } from "../lib/socket";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  restaurantId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
    const { data } = await api.post("/auth/restaurant/login", { email, password });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function logout() {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    disconnectSocket();
    setUser(null);
    if (refreshToken) await api.post("/auth/logout", { refreshToken }).catch(() => {});
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
