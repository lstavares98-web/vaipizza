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

export default function Home() {
  const navigate = useNavigate();
  const [courier, setCourier] = useState<CourierProfile | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = courier?.status === "AVAILABLE";
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
    if (me.courier.status === "AVAILABLE") {
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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => load();
    socket.on("assignment:offered", handler);
    return () => {
      socket.off("assignment:offered", handler);
    };
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

  if (!courier) return <p className="page">A carregar...</p>;

  if (courier.verificationStatus !== "APPROVED") {
    return (
      <div className="page empty-state">
        <h1>Conta pendente de aprovação</h1>
        <p>A sua conta ainda está a ser validada pela plataforma. Volte a tentar mais tarde.</p>
      </div>
    );
  }

  const secondsLeft = assignment ? Math.max(0, Math.round((new Date(assignment.expiresAt).getTime() - now) / 1000)) : 0;

  return (
    <div className="page">
      <div className="status-card">
        <div>
          <strong>{online ? "Online" : "Offline"}</strong>
          <p className="hint">
            {courier.lifetimeDeliveries} entregas · {courier.totalEarnings.toFixed(2)} € ganhos
          </p>
        </div>
        <button className={online ? "toggle-btn on" : "toggle-btn"} onClick={toggleOnline} disabled={busy}>
          {online ? "Ficar offline" : "Ficar online"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {assignment ? (
        <div className="offer-card">
          <h2>Nova entrega — #{assignment.order.orderNumber}</h2>
          <p>{assignment.order.restaurant.name}</p>
          <p className="hint">{assignment.order.restaurant.address}</p>
          <p className="price">{assignment.order.total.toFixed(2)} €</p>
          <p className="countdown">{secondsLeft}s para responder</p>
          <div className="offer-actions">
            <button className="accept-btn" onClick={acceptOffer} disabled={busy || secondsLeft === 0}>
              Aceitar
            </button>
            <button className="reject-btn" onClick={rejectOffer} disabled={busy}>
              Rejeitar
            </button>
          </div>
        </div>
      ) : online ? (
        <p className="empty-hint">À espera de novas entregas...</p>
      ) : (
        <p className="empty-hint">Fique online para receber entregas.</p>
      )}
    </div>
  );
}
