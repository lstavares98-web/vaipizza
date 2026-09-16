import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";
import { disconnectSocket, getSocket } from "../lib/socket";
import { COURIER_SESSION_TERMINATED_EVENT } from "../lib/sessionError";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionMessage: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSessionMessage: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const terminateSession = useCallback((message: string) => {
    tokenStore.clear();
    disconnectSocket();
    setUser(null);
    setSessionMessage(message);
  }, []);

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

  useEffect(() => {
    const handler = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) terminateSession(message);
    };
    window.addEventListener(COURIER_SESSION_TERMINATED_EVENT, handler);
    return () => window.removeEventListener(COURIER_SESSION_TERMINATED_EVENT, handler);
  }, [terminateSession]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;

    const replaced = (payload?: { message?: string }) => {
      terminateSession(payload?.message ?? "A sua conta foi iniciada noutro dispositivo.");
    };
    const operationalState = (payload?: { state?: string }) => {
      if (payload?.state === "SUSPENDED") {
        terminateSession("A sua conta está temporariamente suspensa.");
      } else if (payload?.state === "DEACTIVATED") {
        terminateSession("A sua conta foi desativada.");
      }
    };

    socket.on("session:replaced", replaced);
    socket.on("courier:operational-state", operationalState);
    return () => {
      socket.off("session:replaced", replaced);
      socket.off("courier:operational-state", operationalState);
    };
  }, [terminateSession, user]);

  async function login(email: string, password: string) {
    setSessionMessage(null);
    const { data } = await api.post("/auth/courier/login", { email, password });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function logout() {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken });
    }
    tokenStore.clear();
    disconnectSocket();
    setUser(null);
    setSessionMessage(null);
  }

  function clearSessionMessage() {
    setSessionMessage(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, sessionMessage, login, logout, clearSessionMessage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
