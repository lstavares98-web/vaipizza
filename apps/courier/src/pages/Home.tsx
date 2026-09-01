import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useLocationReporting } from "../hooks/useLocationReporting";

interface CourierProfile {
  id: string;
  status: string;
  verificationStatus: string;
  totalEarnings: number;
  lifetimeDeliveries: number;
}
interface Assignment {
  id: string;
  expiresAt: string;
  order: {
    id: string;
    orderNumber: number;
    total: number;
    fulfillmentType: string;
    restaurant: { name: string; address: string };
  };
}
interface TodaySummary {
  today: { deliveries: number; total: number };
  pendingCashTotal: number;
}

export default function Home() {
  const navigate = useNavigate();
  const [courier, setCourier] = useState<CourierProfile | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = courier?.status === "AVAILABLE" || courier?.status === "ASSIGNED";
  useLocationReporting(online);

  const load = useCallback(async () => {
    const [{ data: me }, { data: current }] = await Promise.all([
      api.get("/courier/me"),
      api.get("/courier/orders/current"),
    ]);
    setCourier(me.courier);
    if (current.order) {
      navigate("/delivery");
      return;
    }
    if (me.courier.status === "AVAILABLE" || me.courier.status === "ASSIGNED") {
      const { data: offer } = await api.get("/courier/assignments/current");
      setAssignment(offer.assignment);
    } else {
      setAssignment(null);
    }
  }, [navigate]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    api.get("/courier/earnings").then(({ data }) => {
      if (!data.today) return;
      setToday({ today: data.today, pendingCashTotal: data.pendingCashTotal ?? 0 });
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => load();
    socket.on("assignment:offered", handler);
    return () => socket.off("assignment:offered", handler);
  }, [load]);

  async function toggleOnline() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/courier/online", { online: !online });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível mudar de estado");
    } finally {
      setBusy(false);
    }
  }

  async function acceptOffer() {
    if (!assignment) return;
    setBusy(true);
    try {
      await api.post(`/courier/assignments/${assignment.id}/accept`);
      navigate("/delivery");
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function rejectOffer() {
    if (!assignment) return;
    setBusy(true);
    try {
      await api.post(`/courier/assignments/${assignment.id}/reject`);
      setAssignment(null);
    } finally {
      setBusy(false);
    }
  }

  if (!courier) return <p className="page loading-copy">A carregar...</p>;

  if (courier.verificationStatus !== "APPROVED") {
    return (
      <div className="page empty-state">
        <span className="empty-icon">⌛</span>
        <p className="page-eyebrow">Conta de estafeta</p>
        <h1>Pendente de aprovação</h1>
        <p>A sua conta ainda está a ser validada. Quando estiver aprovada, poderá ficar online e receber entregas.</p>
      </div>
    );
  }

  const secondsLeft = assignment ? Math.max(0, Math.round((new Date(assignment.expiresAt).getTime() - now) / 1000)) : 0;

  return (
    <div className="page courier-home">
      <section className={`availability-hero ${online ? "is-online" : ""}`}>
        <div>
          <p className="page-eyebrow">Estado de trabalho</p>
          <div className="availability-title">
            <span className="status-dot" />
            <h1>{online ? "Online" : "Offline"}</h1>
          </div>
          <p>{online ? "Está disponível para novas entregas." : "Fique online quando estiver pronto para começar."}</p>
        </div>
        <button className={`availability-toggle ${online ? "on" : ""}`} onClick={toggleOnline} disabled={busy}>
          {busy ? "A atualizar..." : online ? "Ficar offline" : "Ficar online"}
        </button>
      </section>

      <section className="courier-stats-grid" aria-label="Resumo do estafeta">
        <div><span>Hoje</span><strong>{today?.today.deliveries ?? 0}</strong><small>entregas</small></div>
        <div><span>Hoje</span><strong>{(today?.today.total ?? 0).toFixed(2)} €</strong><small>ganhos</small></div>
        <div><span>Total</span><strong>{courier.lifetimeDeliveries}</strong><small>entregas</small></div>
      </section>

      {today && today.pendingCashTotal > 0 && (
        <div className="cash-alert"><span>Dinheiro por acertar</span><strong>{today.pendingCashTotal.toFixed(2)} €</strong></div>
      )}
      {error && <p className="form-error notice-error">{error}</p>}

      {assignment ? (
        <section className="offer-card" aria-live="assertive">
          <div className="offer-topline">
            <span className="offer-live">Nova entrega</span>
            <span className="countdown">{secondsLeft}s</span>
          </div>
          <h2>Pedido #{assignment.order.orderNumber}</h2>
          <div className="offer-route">
            <span className="route-dot restaurant-dot" />
            <div><small>Recolha</small><strong>{assignment.order.restaurant.name}</strong><p>{assignment.order.restaurant.address}</p></div>
          </div>
          <div className="offer-total"><span>Valor do pedido</span><strong>{assignment.order.total.toFixed(2)} €</strong></div>
          <div className="offer-actions">
            <button className="reject-btn" onClick={rejectOffer} disabled={busy}>Recusar</button>
            <button className="accept-btn" onClick={acceptOffer} disabled={busy || secondsLeft === 0}>Aceitar entrega</button>
          </div>
        </section>
      ) : (
        <section className="waiting-card">
          <span className="waiting-pulse" />
          <p className="page-eyebrow">{online ? "À procura" : "Pausado"}</p>
          <h2>{online ? "À espera da próxima entrega" : "Está offline"}</h2>
          <p>{online ? "Pode manter esta aplicação aberta. A nova entrega aparece automaticamente." : "Quando quiser receber entregas, toque em Ficar online."}</p>
        </section>
      )}
    </div>
  );
}
