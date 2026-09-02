import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const REPORT_INTERVAL_MS = 15_000;
const MIN_IMMEDIATE_REPORT_MS = 5_000;
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 20_000,
};

export interface LocationReportingState {
  lastSentAt: number | null;
  accuracyM: number | null;
  error: string | null;
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Permita a localização precisa para receber entregas.";
  if (error.code === error.POSITION_UNAVAILABLE) return "O telemóvel não conseguiu obter uma localização GPS.";
  if (error.code === error.TIMEOUT) return "O GPS demorou demasiado. Tente novamente num local com melhor sinal.";
  return "Não foi possível obter a localização.";
}

export function getHighAccuracyPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo não disponibiliza geolocalização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

export async function reportPosition(position: GeolocationPosition) {
  await api.post("/courier/location", {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: position.coords.accuracy,
  });
  return {
    sentAt: Date.now(),
    accuracyM: position.coords.accuracy,
  };
}

/** Capture a fresh point before the backend is asked to put a courier online. */
export async function captureAndReportCurrentLocation() {
  const position = await getHighAccuracyPosition();
  return reportPosition(position);
}

/**
 * Runtime GPS tracker.
 *
 * `watchPosition` supplies movement updates, while the 15s heartbeat resends
 * the most recent point even if the courier is standing still. Browsers may
 * suspend timers in the background; when the page becomes visible again we
 * force a new high-accuracy reading immediately. The backend remains the
 * authority and treats a point older than its configured TTL as stale.
 */
export function useLocationReporting(enabled: boolean): LocationReportingState {
  const latestPosition = useRef<GeolocationPosition | null>(null);
  const lastSentAtRef = useRef(0);
  const sendingRef = useRef(false);
  const [state, setState] = useState<LocationReportingState>({
    lastSentAt: null,
    accuracyM: null,
    error: null,
  });

  const send = useCallback(async (position: GeolocationPosition, force = false) => {
    const now = Date.now();
    if (sendingRef.current) return;
    if (!force && now - lastSentAtRef.current < MIN_IMMEDIATE_REPORT_MS) return;

    sendingRef.current = true;
    try {
      const result = await reportPosition(position);
      lastSentAtRef.current = result.sentAt;
      setState({ lastSentAt: result.sentAt, accuracyM: result.accuracyM, error: null });
    } catch {
      setState((current) => ({ ...current, error: "Sem ligação para atualizar o GPS. A tentar novamente…" }));
    } finally {
      sendingRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const position = await getHighAccuracyPosition();
      latestPosition.current = position;
      await send(position, true);
    } catch (error) {
      const message =
        error && typeof error === "object" && "code" in error
          ? geolocationErrorMessage(error as GeolocationPositionError)
          : error instanceof Error
            ? error.message
            : "Não foi possível obter a localização.";
      setState((current) => ({ ...current, error: message }));
    }
  }, [enabled, send]);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    void refresh();

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestPosition.current = position;
        void send(position);
      },
      (error) => setState((current) => ({ ...current, error: geolocationErrorMessage(error) })),
      GEO_OPTIONS,
    );

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (latestPosition.current) void send(latestPosition.current, true);
      else void refresh();
    }, REPORT_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onPageShow = () => void refresh();
    const onNetworkOnline = () => void refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onNetworkOnline);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onNetworkOnline);
    };
  }, [enabled, refresh, send]);

  return state;
}
