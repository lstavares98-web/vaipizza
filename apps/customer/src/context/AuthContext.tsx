import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string, phone: string, addressLine1: string, postalCode: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
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
    return data.user as AuthUser;
  }

  async function register(name: string, email: string, password: string, phone: string, addressLine1: string, postalCode: string) {
    const { data } = await api.post("/auth/register", { name, email, password, phone, addressLine1, postalCode });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function changePassword(password: string) {
    await api.post("/users/me/password", { password });
    tokenStore.clear();
    setUser(null);
  }

  async function logout() {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    setUser(null);
    if (refreshToken) await api.post("/auth/logout", { refreshToken }).catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, changePassword, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
