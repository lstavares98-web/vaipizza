import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./CourierOperationsPanel.css";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { fixLeafletIcons } from "../lib/leafletIcons";
import { COURIER_INELIGIBILITY_LABELS, COURIER_STATUS_LABELS, formatGpsAge } from "../lib/courierPresentation";
import { getCourierIndicatorStyle } from "../lib/courierIndicator";

fixLeafletIcons();

export interface OperationalCourier {
  id: string;
  name: string;
  vehicleType: string;
  status: string;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
  locationAgeSeconds: number | null;
  locationAccuracyM: number | null;
  distanceKm: number | null;
  gpsFresh: boolean;
  gpsAccurate: boolean;
  inDispatchZone: boolean;
  tooFar: boolean;
  eligibleForDispatch: boolean;
  ineligibilityReason: string | null;
  activeOrder: { id: string; orderNumber: number; status: string } | null;
  nextOrder: { id: string; orderNumber: number; status: string } | null;
}

interface Feed {
  restaurant: { lat: number; lng: number; courierDispatchRadiusKm: number };
  couriers: OperationalCourier[];
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 12);
  }, [lat, lng, map]);
  return null;
}

function MapFocus({ courier }: { courier: OperationalCourier | null }) {
  const map = useMap();
  useEffect(() => {
    if (courier?.lat === null || courier?.lat === undefined || courier.lng === null || courier.lng === undefined) return;
    map.setView([courier.lat, courier.lng], 15, { animate: true });
  }, [courier?.id, courier?.lat, courier?.lng, map]);
  return null;
}

export default function CourierOperationsPanel() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/restaurant/orders/couriers/nearby");
      setFeed({ restaurant: data.restaurant, couriers: data.couriers });
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => void load();
    socket.on("order:status", refresh);
    socket.on("dispatch:attention", refresh);
    socket.on("assignment:reserved", refresh);
    socket.on("assignment:promoted", refresh);
    return () => {
      socket.off("order:status", refresh);
      socket.off("dispatch:attention", refresh);
      socket.off("assignment:reserved", refresh);
      socket.off("assignment:promoted", refresh);
    };
  }, [load]);

  const selectedCourier = useMemo(
    () => feed?.couriers.find((courier) => courier.id === selectedCourierId) ?? null,
    [feed?.couriers, selectedCourierId],
  );

  if (!feed) {
    return (
      <section className="courier-ops-panel">
        <div className="courier-ops-heading">
          <div><p className="page-eyebrow">Despacho</p><h2>Estafetas ao vivo</h2></div>
          <span className="courier-refresh-copy">{error ? "Sem ligação" : "A carregar…"}</span>
        </div>
      </section>
    );
  }

  const { restaurant, couriers } = feed;
  const available = couriers.filter((c) => c.eligibleForDispatch).length;
  const knownPositions = couriers.filter((c) => c.lat !== null && c.lng !== null);
  const selectedHasLocation = selectedCourier?.lat !== null && selectedCourier?.lat !== undefined && selectedCourier?.lng !== null && selectedCourier?.lng !== undefined;

  function selectCourier(courierId: string) {
    setSelectedCourierId((current) => (current === courierId ? null : courierId));
  }

  return (
    <section className="courier-ops-panel">
      <div className="courier-ops-heading">
        <div>
          <p className="page-eyebrow">Despacho</p>
          <h2>Estafetas ao vivo</h2>
          <p>{available} elegível{available === 1 ? "" : "is"} · raio operacional {restaurant.courierDispatchRadiusKm} km</p>
        </div>
        <span className={`courier-refresh-copy ${error ? "has-error" : ""}`}>{error ? "Falha na atualização" : "Atualiza a cada 10 s"}</span>
      </div>

      {selectedCourier && (
        <div className={`courier-map-selection ${selectedHasLocation ? "has-location" : "no-location"}`} role="status">
          <strong>{selectedCourier.name}</strong>
          <span>
            {selectedHasLocation
              ? `GPS ${formatGpsAge(selectedCourier.locationAgeSeconds)}${selectedCourier.locationAccuracyM !== null ? ` · ±${Math.round(selectedCourier.locationAccuracyM)} m` : ""}`
              : "Localização indisponível"}
          </span>
        </div>
      )}

      <div className="courier-ops-grid">
        <div className="courier-live-map">
          <MapContainer center={[restaurant.lat, restaurant.lng]} zoom={12} style={{ width: "100%", height: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <Recenter lat={restaurant.lat} lng={restaurant.lng} />
            <MapFocus courier={selectedCourier} />
            <Circle center={[restaurant.lat, restaurant.lng]} radius={restaurant.courierDispatchRadiusKm * 1000} />
            <Marker position={[restaurant.lat, restaurant.lng]}>
              <Popup>VAIPIZZA · ponto de referência do despacho</Popup>
            </Marker>
            {knownPositions.map((courier) => (
              <Fragment key={courier.id}>
                {courier.locationAccuracyM !== null && courier.locationAccuracyM > 0 && (
                  <Circle
                    center={[courier.lat!, courier.lng!]}
                    radius={Math.max(2, courier.locationAccuracyM)}
                    pathOptions={{
                      weight: selectedCourierId === courier.id ? 2 : 1,
                      opacity: selectedCourierId === courier.id ? 0.9 : 0.45,
                      fillOpacity: selectedCourierId === courier.id ? 0.16 : 0.08,
                    }}
                  />
                )}
                <Marker position={[courier.lat!, courier.lng!]}>
                  <Popup>
                    <strong>{courier.name}</strong><br />
                    {COURIER_STATUS_LABELS[courier.status] ?? courier.status}<br />
                    {courier.distanceKm !== null ? `${courier.distanceKm} km da pizzaria` : "Distância indisponível"}<br />
                    GPS {formatGpsAge(courier.locationAgeSeconds)}
                    {courier.locationAccuracyM !== null ? ` · ±${Math.round(courier.locationAccuracyM)} m` : ""}
                    {courier.activeOrder ? <><br />Atual #{courier.activeOrder.orderNumber}</> : null}
                    {courier.nextOrder ? <><br />Próxima #{courier.nextOrder.orderNumber}</> : null}
                  </Popup>
                </Marker>
              </Fragment>
            ))}
          </MapContainer>
        </div>

        <div className="courier-ops-list">
          {couriers.length === 0 ? (
            <div className="courier-empty">Nenhum estafeta aprovado.</div>
          ) : couriers.map((courier) => {
            const selected = selectedCourierId === courier.id;
            return (
              <article
                className={`courier-ops-row ${courier.eligibleForDispatch ? "is-eligible" : ""} ${selected ? "is-selected" : ""}`}
                key={courier.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`Localizar ${courier.name} no mapa`}
                onClick={() => selectCourier(courier.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectCourier(courier.id);
                  }
                }}
              >
                <div className="courier-ops-main">
                  <div className="courier-name-line">
                    <span className="courier-state-dot" style={getCourierIndicatorStyle(courier.status, courier.eligibleForDispatch)} />
                    <strong>{courier.name}</strong>
                    <span className={`courier-eligibility ${courier.eligibleForDispatch ? "ok" : "blocked"}`}>
                      {courier.eligibleForDispatch ? "Elegível" : "Não elegível"}
                    </span>
                  </div>
                  <p>{COURIER_STATUS_LABELS[courier.status] ?? courier.status}</p>
                  {courier.activeOrder && <p className="courier-active-order">Atual #{courier.activeOrder.orderNumber}</p>}
                  {courier.nextOrder && <p className="courier-active-order">Próxima #{courier.nextOrder.orderNumber} · reservada</p>}
                </div>
                <div className="courier-ops-metrics">
                  <span>{courier.distanceKm === null ? "—" : `${courier.distanceKm} km`}</span>
                  <span>GPS {formatGpsAge(courier.locationAgeSeconds)}</span>
                  <span>{courier.locationAccuracyM === null ? "precisão —" : `±${Math.round(courier.locationAccuracyM)} m`}</span>
                  {!courier.eligibleForDispatch && courier.ineligibilityReason && (
                    <strong>{COURIER_INELIGIBILITY_LABELS[courier.ineligibilityReason] ?? courier.ineligibilityReason}</strong>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
