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
  const [cashStep, setCashStep] = useState(false);
  const [amountTendered, setAmountTendered] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/courier/orders/current").then(({ data }) => setOrder(data.order));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    if (order === null) navigate("/");
  }, [order, navigate]);

  if (order === undefined) return <p className="page">A carregar...</p>;
  if (!order) return null;

  const action = NEXT_ACTION[order.status];

  async function advance(extra?: { amountTendered: number }) {
    if (!action || !order) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/courier/orders/${order.id}/status`, { status: action.next, ...extra });
      if (action.next === "DELIVERED") {
        navigate("/");
      } else {
        load();
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível confirmar");
    } finally {
      setBusy(false);
    }
  }

  function handlePrimaryAction() {
    if (action?.next === "DELIVERED" && order!.paymentMethod === "CASH") {
      setCashStep(true);
      return;
    }
    advance();
  }

  function confirmCash() {
    const value = Number(amountTendered.replace(",", "."));
    if (!value || value < order!.total) {
      setError(`O valor entregue tem de ser pelo menos ${order!.total.toFixed(2)} €`);
      return;
    }
    advance({ amountTendered: value });
  }

  const changeDue = amountTendered ? Number(amountTendered.replace(",", ".")) - order.total : null;

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

        {cashStep ? (
          <section className="cash-step">
            <h3>Valor entregue pelo cliente</h3>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder={`Mín. ${order.total.toFixed(2)}`}
              value={amountTendered}
              onChange={(e) => setAmountTendered(e.target.value)}
              autoFocus
            />
            {changeDue != null && changeDue >= 0 && (
              <p className="change-due">Troco a devolver: {changeDue.toFixed(2)} €</p>
            )}
            {error && <p className="form-error">{error}</p>}
            <button className="accept-btn full-width" onClick={confirmCash} disabled={busy}>
              {busy ? "A confirmar..." : "Confirmar entrega e troco"}
            </button>
          </section>
        ) : (
          action && (
            <>
              {error && <p className="form-error">{error}</p>}
              <button className="accept-btn full-width" onClick={handlePrimaryAction} disabled={busy}>
                {busy ? "A processar..." : action.label}
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
