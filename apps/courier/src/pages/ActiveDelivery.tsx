import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";
import { fixLeafletIcons } from "../lib/leafletIcons";

fixLeafletIcons();

interface OrderItem {
  id: string;
  productNameSnapshot: string;
  quantity: number;
}
interface ActiveOrder {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  paymentMethod: "CARD" | "CASH" | "MBWAY" | "TERMINAL";
  amountTendered: number | null;
  changeDue: number | null;
  restaurant: { name: string; address: string; lat: number; lng: number };
  address: { line1: string; city: string; lat: number; lng: number } | null;
  user: { name: string; phone: string | null };
  items: OrderItem[];
}

const NEXT_ACTION: Record<string, { label: string; next: "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" }> = {
  COURIER_ASSIGNED: { label: "Confirmar recolha no restaurante", next: "PICKED_UP" },
  PICKED_UP: { label: "A caminho do cliente", next: "OUT_FOR_DELIVERY" },
  OUT_FOR_DELIVERY: { label: "Confirmar entrega", next: "DELIVERED" },
};

export default function ActiveDelivery() {
  const navigate = useNavigate();
  const [order, setOrder] = useState<ActiveOrder | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/courier/orders/current");
    setOrder(data.order);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (order === null) navigate("/");
  }, [order, navigate]);

  if (order === undefined) return <p className="page">A carregar...</p>;
  if (!order) return null;

  const action = NEXT_ACTION[order.status];

  // Awaiting the refetch before clearing `busy` matters: without it the
  // button re-enables while `order.status` (and therefore `action`) is
  // still stale, so a quick second tap resends the *same* status the
  // order is already in — the backend correctly rejects "PICKED_UP ->
  // PICKED_UP", but the courier just sees a confusing error.
  async function advance() {
    if (!action || !order) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/courier/orders/${order.id}/status`, { status: action.next });
      if (action.next === "DELIVERED") {
        navigate("/");
        return;
      }
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível confirmar");
    } finally {
      setBusy(false);
    }
  }

  const restaurantPos: [number, number] = [order.restaurant.lat, order.restaurant.lng];
  const customerPos: [number, number] | null = order.address ? [order.address.lat, order.address.lng] : null;
  const center = order.status === "COURIER_ASSIGNED" ? restaurantPos : (customerPos ?? restaurantPos);

  return (
    <div className="delivery-page">
      <div className="map-wrap">
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <Marker position={restaurantPos}>
            <Popup>{order.restaurant.name}</Popup>
          </Marker>
          {customerPos && (
            <Marker position={customerPos}>
              <Popup>{order.user.name}</Popup>
            </Marker>
          )}
          {customerPos && <Polyline positions={[restaurantPos, customerPos]} color="#ff4d30" />}
        </MapContainer>
      </div>

      <div className="delivery-info">
        <h1>Pedido #{order.orderNumber}</h1>
        <section>
          <h3>Restaurante</h3>
          <p>{order.restaurant.name}</p>
          <p className="hint">{order.restaurant.address}</p>
        </section>
        {order.address && (
          <section>
            <h3>Cliente</h3>
            <p>{order.user.name}</p>
            <p className="hint">
              {order.address.line1}, {order.address.city}
            </p>
            {order.user.phone && (
              <a className="call-btn" href={`tel:${order.user.phone}`}>
                📞 Ligar ao cliente
              </a>
            )}
          </section>
        )}
        <section>
          <h3>Itens</h3>
          <ul>
            {order.items.map((item) => (
              <li key={item.id}>
                {item.quantity}x {item.productNameSnapshot}
              </li>
            ))}
          </ul>
          <p className="price">
            {order.total.toFixed(2)} € {order.paymentMethod === "CASH" && "· Dinheiro"}
          </p>
        </section>

        {/* The restaurant already prepared this change based on what the
            customer declared at checkout — the courier just carries it and
            hands it over, nothing to type here. */}
        {order.paymentMethod === "CASH" && order.changeDue != null && (
          <section className="cash-step">
            <h3>Troco a levar</h3>
            <p className="change-due">{order.changeDue.toFixed(2)} €</p>
            {order.amountTendered != null && (
              <p className="hint">Cliente vai pagar com {order.amountTendered.toFixed(2)} €</p>
            )}
          </section>
        )}

        {error && <p className="form-error">{error}</p>}
        {action && (
          <button className="accept-btn full-width" onClick={advance} disabled={busy}>
            {busy ? "A processar..." : action.label}
          </button>
        )}
      </div>
    </div>
  );
}
