import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { useLocationReporting, type LocationReportingState } from "../hooks/useLocationReporting";

export interface CourierProfile {
  id: string;
  status: "OFFLINE" | "AVAILABLE" | "ASSIGNED" | "GOING_TO_RESTAURANT" | "AT_RESTAURANT" | "PICKED_UP" | "DELIVERING";
  verificationStatus: string;
  totalEarnings: number;
  lifetimeDeliveries: number;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
  locationAccuracyM: number | null;
}

interface CourierRuntimeValue {
  courier: CourierProfile | null;
  loading: boolean;
  location: LocationReportingState;
  refreshCourier: () => Promise<CourierProfile | null>;
}

const CourierRuntimeContext = createContext<CourierRuntimeValue | null>(null);

export function CourierRuntimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [courier, setCourier] = useState<CourierProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshCourier = useCallback(async () => {
    if (!user) {
      setCourier(null);
      return null;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/courier/me");
      setCourier(data.courier);
      return data.courier as CourierProfile;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCourier(null);
      return;
    }
    void refreshCourier();
    const timer = window.setInterval(() => void refreshCourier(), 10_000);
    return () => window.clearInterval(timer);
  }, [user, refreshCourier]);

  const trackingEnabled = Boolean(user && courier && courier.status !== "OFFLINE");
  const location = useLocationReporting(trackingEnabled);

  return (
    <CourierRuntimeContext.Provider value={{ courier, loading, location, refreshCourier }}>
      {children}
    </CourierRuntimeContext.Provider>
  );
}

export function useCourierRuntime() {
  const value = useContext(CourierRuntimeContext);
  if (!value) throw new Error("useCourierRuntime must be used within CourierRuntimeProvider");
  return value;
}
