import { useEffect, useRef } from "react";
import { api } from "../lib/api";

const REPORT_INTERVAL_MS = 30_000;

/** While `enabled`, reports GPS position to the API roughly every 30s. */
export function useLocationReporting(enabled: boolean) {
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentAt.current < REPORT_INTERVAL_MS) return;
        lastSentAt.current = now;
        api.post("/courier/location", { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);
}
