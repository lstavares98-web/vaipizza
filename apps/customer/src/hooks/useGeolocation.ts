import { useState } from "react";

interface Coords {
  lat: number;
  lng: number;
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function requestLocation() {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada neste dispositivo");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Não foi possível obter a localização");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return { coords, error, loading, requestLocation, setCoords };
}
