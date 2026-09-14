import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useCourierRuntime } from "../context/CourierRuntimeContext";
import { buildDirectionsUrl, getDeliveryStep } from "../lib/deliveryPresentation";
import { startOfferAlert, stopOfferAlert } from "../lib/offerAlert";

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
interface NextAssignment {
  id: string;
  status: "OFFERED" | "ACCEPTED";
  expiresAt: string;
  order: {
    id: string;
    orderNumber: number;
    total: number;
    restaurant: { name: string; address: string };
  };
}

export default function ActiveDelivery() {
  const navigate = useNavigate();
  const { refreshCourier } = useCourierRuntime();
  const [order, setOrder] = useState<ActiveOrder | null | undefined>(undefined);
  const [nextAssignment, setNextAssignment] = useState<NextAssignment | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/courier/orders/current");
    setOrder(data.order);
  }, []);

  const loadNext = useCallback(async () => {
    const { data } = await api.get("/courier/orders/next");
    setNextAssignment(data.assignment ?? null);
  }, []);

  useEffect(() => {
    void load();
    void loadNext();
  }, [load, loadNext]);
  useEffect(() => { if (order === null) navigate("/"); }, [order, navigate]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => void loadNext(), 10_000);
    return () => window.clearInterval(t);
  }, [loadNext]);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refreshCurrent = () => void load();
    const refreshNext = () => void loadNext();
    socket.on("assignment:cancelled", refreshCurrent);
    socket.on("assignment:offered", refreshNext);
    socket.on("assignment:reserved", refreshNext);
    socket.on("assignment:promoted", refreshNext);
    return () => {
      socket.off("assignment:cancelled", refreshCurrent);
      socket.off("assignment:offered", refreshNext);
      socket.off("assignment:reserved", refreshNext);
      socket.off("assignment:promoted", refreshNext);
    };
  }, [load, loadNext]);

  const nextSecondsLeft = nextAssignment?.status === "OFFERED"
    ? Math.max(0, Math.round((new Date(nextAssignment.expiresAt).getTime() - now) / 1000))
    : 0;

  useEffect(() => {
    if (nextAssignment?.status === "OFFERED" && nextSecondsLeft === 0) {
      setNextAssignment(null);
    }
  }, [nextAssignment?.id, nextAssignment?.status, nextSecondsLeft]);

  useEffect(() => {
    if (nextAssignment?.status === "OFFERED" && nextSecondsLeft > 0) startOfferAlert();
    else stopOfferAlert();
    return () => stopOfferAlert();
  }, [nextAssignment?.id, nextAssignment?.status, nextSecondsLeft === 0]);

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
        // A reserved delivery may have been promoted atomically by the API.
        const { data } = await api.get("/courier/orders/current");
        await loadNext();
        if (data.order) {
          setOrder(data.order);
        } else {
          navigate("/");
        }
        return;
      }
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível confirmar");
    } finally {
      setBusy(false);
    }
  }

  async function acceptNext() {
    if (!nextAssignment || nextAssignment.status !== "OFFERED") return;
    stopOfferAlert();
    setNextBusy(true);
    setNextError(null);
    try {
      await api.post(`/courier/assignments/${nextAssignment.id}/accept`);
      await loadNext();
    } catch (err: any) {
      setNextError(err.response?.data?.message ?? "Esta oferta já não está disponível");
      await loadNext();
    } finally {
      setNextBusy(false);
    }
  }

  async function rejectNext() {
    if (!nextAssignment || nextAssignment.status !== "OFFERED") return;
    stopOfferAlert();
    setNextBusy(true);
    setNextError(null);
    try {
      await api.post(`/courier/assignments/${nextAssignment.id}/reject`);
      setNextAssignment(null);
    } catch (err: any) {
      setNextError(err.response?.data?.message ?? "Não foi possível recusar a próxima entrega");
      await loadNext();
    } finally {
      setNextBusy(false);
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

        {nextAssignment && (
          <section className={`offer-card next-delivery-card ${nextAssignment.status === "ACCEPTED" ? "is-reserved" : ""}`} aria-live="assertive">
            {nextAssignment.status === "OFFERED" ? (
              <>
                <div className="offer-topline">
                  <span className="offer-live">Nova próxima entrega</span>
                  <span className="countdown">{nextSecondsLeft}s</span>
                </div>
                <h2>Pedido #{nextAssignment.order.orderNumber}</h2>
                <p><strong>{nextAssignment.order.restaurant.name}</strong></p>
                <p>{nextAssignment.order.restaurant.address}</p>
                <div className="offer-total"><span>Valor do pedido</span><strong>{nextAssignment.order.total.toFixed(2)} €</strong></div>
                <p className="delivery-status-copy">Pode aceitar esta como a sua próxima entrega. O pedido atual continua a ser a prioridade.</p>
                <div className="offer-actions">
                  <button className="reject-btn" onClick={rejectNext} disabled={nextBusy}>Recusar</button>
                  <button className="accept-btn" onClick={acceptNext} disabled={nextBusy || nextSecondsLeft === 0}>Aceitar próxima</button>
                </div>
              </>
            ) : (
              <>
                <p className="page-eyebrow">Fila pessoal</p>
                <h2>Próxima entrega reservada</h2>
                <p>Pedido <strong>#{nextAssignment.order.orderNumber}</strong> · {nextAssignment.order.restaurant.name}</p>
                <p className="delivery-status-copy">Assim que concluir o pedido atual, esta entrega passa automaticamente a ativa.</p>
              </>
            )}
            {nextError && <p className="form-error notice-error">{nextError}</p>}
          </section>
        )}

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
