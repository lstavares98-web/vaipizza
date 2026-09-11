import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useCourierRuntime } from "../context/CourierRuntimeContext";
import { buildDirectionsUrl, getDeliveryStep } from "../lib/deliveryPresentation";

interface OrderItem { id: string; productNameSnapshot: string; quantity: number; }
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

export default function ActiveDelivery() {
  const navigate = useNavigate();
  const { refreshCourier } = useCourierRuntime();
  const [order, setOrder] = useState<ActiveOrder | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/courier/orders/current");
    setOrder(data.order);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (order === null) navigate("/"); }, [order, navigate]);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onCancelled = () => void load();
    socket.on("assignment:cancelled", onCancelled);
    return () => {
      socket.off("assignment:cancelled", onCancelled);
    };
  }, [load]);

  if (order === undefined) return <p className="page loading-copy">A carregar...</p>;
  if (!order) return null;

  const step = getDeliveryStep(order.status);

  async function advance() {
    if (!step || !order) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/courier/orders/${order.id}/status`, { status: step.next });
      await refreshCourier();
      if (step.next === "DELIVERED") {
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

  const isCustomerTarget = step?.target === "customer" && Boolean(order.address);
  const targetLat = isCustomerTarget && order.address ? order.address.lat : order.restaurant.lat;
  const targetLng = isCustomerTarget && order.address ? order.address.lng : order.restaurant.lng;
  const directionsUrl = buildDirectionsUrl(targetLat, targetLng);
  const targetName = isCustomerTarget ? order.user.name : (order.restaurant.name || "VAIPIZZA");
  const targetAddress = isCustomerTarget && order.address
    ? `${order.address.line1}, ${order.address.city}`
    : order.restaurant.address;
  const stageLabel = isCustomerTarget ? "Entrega" : "Recolha";
  const stageHint = !isCustomerTarget
    ? "Abra a navegação e siga para o restaurante para recolher o pedido."
    : order.status === "PICKED_UP"
      ? "Abra a navegação e siga para a morada do cliente."
      : "Confirme a entrega assim que o pedido estiver nas mãos do cliente.";
  const canCallCustomer = isCustomerTarget && Boolean(order.user.phone);

  return (
    <div className="delivery-page">
      <div className="delivery-info">
        <section className="delivery-status-card">
          <div className="delivery-status-topline">
            <span className="delivery-order-badge">Pedido #{order.orderNumber}</span>
            <span className="delivery-stage-badge">{stageLabel}</span>
          </div>
          <p className="page-eyebrow">Etapa atual</p>
          <h1>{step?.title ?? "Entrega ativa"}</h1>
          <p className="delivery-status-copy">{stageHint}</p>
        </section>

        <section className="delivery-target-card">
          <p className="page-eyebrow">{isCustomerTarget ? "Destino do cliente" : "Local de recolha"}</p>
          <h2>{targetName}</h2>
          <p>{targetAddress}</p>
          <div className={`delivery-quick-actions ${canCallCustomer ? "" : "single"}`}>
            <a className="nav-btn" href={directionsUrl} target="_blank" rel="noreferrer">Navegar</a>
            {canCallCustomer && <a className="call-btn" href={`tel:${order.user.phone}`}>Ligar</a>}
          </div>
          <small className="navigation-note">O botão Navegar abre o Google Maps com o destino já preenchido.</small>
        </section>

        <section className="delivery-order-card">
          <div className="section-title-row"><h2>Pedido</h2><strong>{order.total.toFixed(2)} €</strong></div>
          <ul className="delivery-items">
            {order.items.map((item) => <li key={item.id}><span>{item.quantity}×</span>{item.productNameSnapshot}</li>)}
          </ul>
          <span className="payment-chip">{order.paymentMethod === "CASH" ? "Dinheiro" : order.paymentMethod}</span>
        </section>

        {order.paymentMethod === "CASH" && order.changeDue != null && (
          <section className="cash-step">
            <span>Troco a levar</span>
            <strong className="change-due">{order.changeDue.toFixed(2)} €</strong>
            {order.amountTendered != null && <p>Cliente vai pagar com {order.amountTendered.toFixed(2)} €</p>}
          </section>
        )}

        {error && <p className="form-error notice-error">{error}</p>}
      </div>

      {step && (
        <div className="delivery-action-dock">
          <div><small>Próxima ação</small><strong>{step.title}</strong></div>
          <button className="primary-delivery-action" onClick={advance} disabled={busy}>{busy ? "A processar..." : step.label}</button>
        </div>
      )}
    </div>
  );
}
