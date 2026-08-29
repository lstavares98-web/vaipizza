import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useGeolocation } from "../hooks/useGeolocation";

interface RestaurantListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  avgRating: number;
  ratingCount: number;
  distanceKm: number | null;
  deliveryFee: number | null;
  etaMinutes: number | null;
  isOpen: boolean;
}

export default function Restaurants() {
  const { coords, error, loading: geoLoading, requestLocation } = useGeolocation();
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    api
      .get("/restaurants", { params: { lat: coords?.lat, lng: coords?.lng, search: search || undefined } })
      .then(({ data }) => setRestaurants(data.restaurants))
      .catch(() => setLoadError("Não foi possível carregar os restaurantes. Tente novamente mais tarde."))
      .finally(() => setLoading(false));
  }, [coords, search]);

  const visible = useMemo(
    () => (openOnly ? restaurants.filter((r) => r.isOpen) : restaurants),
    [restaurants, openOnly],
  );

  return (
    <div className="page">
      <h1>Restaurantes</h1>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Procurar restaurantes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="checkbox">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Só abertos
        </label>
        <button type="button" onClick={requestLocation} disabled={geoLoading}>
          {coords ? "📍 Localização ativa" : geoLoading ? "A localizar..." : "📍 Usar minha localização"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loadError && <p className="form-error">{loadError}</p>}

      {loading ? (
        <p>A carregar restaurantes...</p>
      ) : loadError ? null : visible.length === 0 ? (
        <p>Nenhum restaurante encontrado.</p>
      ) : (
        <div className="restaurant-grid">
          {visible.map((r) => (
            <Link to={`/restaurants/${r.slug}`} key={r.id} className={`restaurant-card ${r.isOpen ? "" : "closed"}`}>
              <div className="restaurant-card-image" style={{ backgroundImage: r.logoUrl ? `url(${r.logoUrl})` : undefined }} />
              <div className="restaurant-card-body">
                <h3>{r.name}</h3>
                <p className="muted">{r.description}</p>
                <div className="restaurant-meta">
                  <span>⭐ {r.avgRating.toFixed(1)} ({r.ratingCount})</span>
                  {r.distanceKm != null && <span>{r.distanceKm} km</span>}
                  {r.etaMinutes != null && <span>{r.etaMinutes} min</span>}
                  {r.deliveryFee != null && <span>{r.deliveryFee.toFixed(2)} € entrega</span>}
                </div>
                {!r.isOpen && <span className="badge badge-closed">Fechado</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
