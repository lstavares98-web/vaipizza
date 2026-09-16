import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playNewOrderChime } from "../lib/sound";
import { ORDER_STATUS_LABELS } from "../lib/orderLabels";
import CourierOperationsPanel from "../components/CourierOperationsPanel";
import { COURIER_INELIGIBILITY_LABELS, COURIER_STATUS_LABELS, formatGpsAge } from "../lib/courierPresentation";
import { useAuth } from "../context/AuthContext";

interface OrderItem {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  lineTotal: number;
  comboSelectionsSnapshot: {
    fixedItems?: { productName: string; quantity: number }[];
    selectedOptions?: { groupName: string; productName: string }[];
  } | null;
}
interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: "DELIVERY" | "PICKUP";
  paymentMethod: "CARD" | "CASH" | "MBWAY" | "TERMINAL";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  user: { name: string; phone: string | null };
  amountTendered: number | null;
  changeDue: number | null;
  total: number;
  createdAt: string;
  notes: string | null;
  items: OrderItem[];
}

const READY_STAGE = ["READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];
const REASSIGNABLE_STAGE = ["WAITING_FOR_COURIER", "COURIER_ASSIGNED"];
const CANCELLABLE_STAGE = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED"];

export default function OrdersDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassignOrder, setReassignOrder] = useState<OrderRow | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderRow | null>(null);
  const canCancelOrders = user?.role === "RESTAURANT_OWNER" || user?.role === "RESTAURANT_STAFF";

  const load = useCallback(() => {
    api.get("/restaurant/orders").then(({ data }) => setOrders(data.orders));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = () => {
      playNewOrderChime();
      load();
    };
    const onStatus = () => load();
    socket.on("order:new", onNew);
    socket.on("order:status", onStatus);
    socket.on("order:payment", onStatus);
    return () => {
      socket.off("order:new", onNew);
      socket.off("order:status", onStatus);
      socket.off("order:payment", onStatus);
    };
  }, [load]);

  const newOrders = orders.filter((o) => o.status === "NEW");
  const preparing = orders.filter((o) => o.status === "ACCEPTED" || o.status === "PREPARING");
  const ready = orders.filter((o) => READY_STAGE.includes(o.status));
  const done = orders
    .filter((o) => ["DELIVERED", "COLLECTED", "CANCELLED"].includes(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todays = orders.filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== "CANCELLED");
    const revenue = todays.reduce((sum, o) => sum + o.total, 0);
    return { count: todays.length, revenue, avgTicket: todays.length ? revenue / todays.length : 0 };
  }, [orders]);

  async function accept(order: OrderRow) {
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "ACCEPTED" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmMbway(order: OrderRow) {
    setBusyId(order.id);
    try {
      await api.post(`/restaurant/orders/${order.id}/confirm-mbway-payment`);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function collect(order: OrderRow) {
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "COLLECTED" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  function pickupWhatsappHref(order: OrderRow) {
    if (!order.user.phone) return null;
    const raw = order.user.phone.replace(/\D/g, "");
    const number = raw.length === 9 ? `351${raw}` : raw;
    const message = encodeURIComponent(`Olá ${order.user.name}! O seu pedido #${order.orderNumber} está pronto para recolha.`);
    return number ? `https://wa.me/${number}?text=${message}` : null;
  }

  return (
    <div className="dashboard">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="page-eyebrow">Operação em tempo real</p>
          <h1>Pedidos</h1>
          <p>Acompanhe a entrada, preparação e saída dos pedidos num só ecrã.</p>
        </div>
        <div className="live-indicator"><span />Ao vivo</div>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{todayStats.count}</span>
          <span className="stat-label">Pedidos hoje</span>
        </div>
        <div className="stat">
          <span className="stat-value">{todayStats.revenue.toFixed(2)} €</span>
          <span className="stat-label">Faturação hoje</span>
        </div>
        <div className="stat">
          <span className="stat-value">{todayStats.avgTicket.toFixed(2)} €</span>
          <span className="stat-label">Ticket médio</span>
        </div>
      </div>

      <CourierOperationsPanel />

      <div className="board">
        <Column title={`Novos (${newOrders.length})`}>
          {newOrders.map((o) => (
            <OrderCard key={o.id} order={o}>
              {o.paymentMethod === "MBWAY" && o.paymentStatus !== "PAID" && (
                <p className="cash-warning">💳 MB WAY — A aguardar confirmação do pagamento</p>
              )}
              {o.paymentMethod === "MBWAY" && o.paymentStatus === "PAID" && (
                <p className="hint">✅ MB WAY — pago</p>
              )}
              <div className="card-actions">
                {o.paymentMethod === "MBWAY" && o.paymentStatus !== "PAID" && (
                  <button disabled={busyId === o.id} onClick={() => confirmMbway(o)}>Confirmar pagamento recebido</button>
                )}
                <button
                  disabled={busyId === o.id || (o.paymentMethod === "MBWAY" && o.paymentStatus !== "PAID")}
                  onClick={() => accept(o)}
                >
                  Aceitar
                </button>
                {canCancelOrders && CANCELLABLE_STAGE.includes(o.status) && (
                  <button className="danger" disabled={busyId === o.id} onClick={() => setCancelOrder(o)}>
                    Cancelar pedido
                  </button>
                )}
              </div>
            </OrderCard>
          ))}
        </Column>

        <Column title={`Em preparação (${preparing.length})`}>
          {preparing.map((o) => (
            <OrderCard key={o.id} order={o}>
              <p className="hint">Na cozinha (KDS)</p>
              {canCancelOrders && CANCELLABLE_STAGE.includes(o.status) && (
                <div className="card-actions">
                  <button className="danger" disabled={busyId === o.id} onClick={() => setCancelOrder(o)}>Cancelar pedido</button>
                </div>
              )}
            </OrderCard>
          ))}
        </Column>

        <Column title={`Prontos / A caminho (${ready.length})`}>
          {ready.map((o) => (
            <OrderCard key={o.id} order={o}>
              {o.fulfillmentType === "PICKUP" && o.status === "READY_FOR_PICKUP" && (
                <div className="card-actions">
                  {pickupWhatsappHref(o) && (
                    <a href={pickupWhatsappHref(o)!} target="_blank" rel="noreferrer">Avisar cliente pelo WhatsApp</a>
                  )}
                  <button disabled={busyId === o.id} onClick={() => collect(o)}>Recolhido</button>
                </div>
              )}
              {o.fulfillmentType === "DELIVERY" && REASSIGNABLE_STAGE.includes(o.status) && (
                <button onClick={() => setReassignOrder(o)}>Reatribuir estafeta</button>
              )}
              {canCancelOrders && CANCELLABLE_STAGE.includes(o.status) && (
                <div className="card-actions">
                  <button className="danger" disabled={busyId === o.id} onClick={() => setCancelOrder(o)}>Cancelar pedido</button>
                </div>
              )}
            </OrderCard>
          ))}
        </Column>

        <Column title="Concluídos (últimos 30)">
          <ul className="compact-list completed-orders-list">
            {done.map((o) => (
              <li key={o.id}>
                <span>
                  #{o.orderNumber} · {ORDER_STATUS_LABELS[o.status] ?? o.status}
                </span>
                <span className="price">{o.total.toFixed(2)} €</span>
              </li>
            ))}
          </ul>
        </Column>
      </div>

      {reassignOrder && (
        <ReassignCourierModal
          order={reassignOrder}
          onClose={() => setReassignOrder(null)}
          onDone={() => {
            setReassignOrder(null);
            load();
          }}
        />
      )}

      {cancelOrder && (
        <CancelOrderModal
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          onDone={() => {
            setCancelOrder(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="column">
      <h2>{title}</h2>
      <div className="column-body">{children}</div>
    </div>
  );
}

function OrderCard({ order, children }: { order: OrderRow; children?: React.ReactNode }) {
  const elapsedMin = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  return (
    <div className={`order-card order-${order.status.toLowerCase().replaceAll("_", "-")}`}>
      <div className="order-card-header">
        <strong>#{order.orderNumber}</strong>
        <span className="hint">{elapsedMin} min</span>
      </div>
      <div className="order-chip-row">
        <span className={`badge fulfillment-${order.fulfillmentType.toLowerCase()}`}>{order.fulfillmentType === "DELIVERY" ? "Delivery" : "Takeaway"}</span>
        <span className="payment-badge">{order.paymentMethod === "CASH" ? "Dinheiro" : order.paymentMethod === "TERMINAL" ? "Terminal" : order.paymentMethod}</span>
        {order.paymentMethod === "MBWAY" && (
          <span className="payment-badge">{order.paymentStatus === "PAID" ? "Pago" : "Aguarda pagamento"}</span>
        )}
      </div>
      <ul>
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.productNameSnapshot}
            {item.comboSelectionsSnapshot && (
              <small className="combo-order-lines">
                {[
                  ...(item.comboSelectionsSnapshot.fixedItems ?? []).map((fixed) => `${fixed.quantity}x ${fixed.productName}`),
                  ...(item.comboSelectionsSnapshot.selectedOptions ?? []).map((selected) => `${selected.groupName}: ${selected.productName}`),
                ].join(" · ")}
              </small>
            )}
          </li>
        ))}
      </ul>
      {order.notes && <p className="hint">Obs: {order.notes}</p>}
      <div className="order-total"><span>Total</span><strong>{order.total.toFixed(2)} €</strong></div>
      {order.paymentMethod === "CASH" && order.changeDue != null && (
        <p className="cash-warning">
          💶 Dinheiro · cliente paga com {order.amountTendered?.toFixed(2)} € → preparar{" "}
          <strong>{order.changeDue.toFixed(2)} € de troco</strong>
          <br />
          <span className="hint">
            O estafeta leva {order.changeDue.toFixed(2)} € de troco e deve voltar com{" "}
            {order.amountTendered?.toFixed(2)} € (o valor todo que o cliente entregou).
          </span>
        </p>
      )}
      {order.paymentMethod === "CASH" && order.changeDue == null && <p className="hint">💶 Dinheiro na entrega</p>}
      <p className="hint">{ORDER_STATUS_LABELS[order.status] ?? order.status}</p>
      {children}
    </div>
  );
}

function CancelOrderModal({ order, onClose, onDone }: { order: OrderRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Indique o motivo do cancelamento.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post(`/restaurant/orders/${order.id}/cancel`, { reason: trimmedReason });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível cancelar este pedido.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <p className="page-eyebrow">Cancelamento operacional</p>
        <h2>Cancelar pedido #{order.orderNumber}</h2>
        <p className="hint">Indique o motivo. O cancelamento fica registado no histórico do pedido.</p>
        <label>
          Motivo do cancelamento
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            autoFocus
            disabled={busy}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="link-btn" onClick={onClose} disabled={busy}>Voltar</button>
          <button type="submit" className="danger" disabled={busy || !reason.trim()}>
            {busy ? "A cancelar..." : "Confirmar cancelamento"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface NearbyCourier {
  id: string;
  name: string;
  vehicleType: string;
  status: string;
  distanceKm: number | null;
  locationAgeSeconds: number | null;
  locationAccuracyM: number | null;
  eligibleForDispatch: boolean;
  ineligibilityReason: string | null;
  activeOrder: { id: string; orderNumber: number; status: string } | null;
}

function ReassignCourierModal({ order, onClose, onDone }: { order: OrderRow; onClose: () => void; onDone: () => void }) {
  const [couriers, setCouriers] = useState<NearbyCourier[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/restaurant/orders/couriers/nearby").then(({ data }) => setCouriers(data.couriers));
  }, []);

  async function assign(courierId: string) {
    setBusy(true);
    try {
      await api.post(`/restaurant/orders/${order.id}/reassign-courier`, { courierId });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reatribuir estafeta — #{order.orderNumber}</h2>
        {couriers === null ? (
          <p className="hint">A carregar estafetas online...</p>
        ) : couriers.length === 0 ? (
          <p className="hint">Nenhum estafeta online de momento.</p>
        ) : (
          <ul className="courier-list">
            {couriers.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <p className="hint">
                    {c.vehicleType} · {COURIER_STATUS_LABELS[c.status] ?? c.status}
                    {c.distanceKm !== null ? ` · ${c.distanceKm} km` : ""}
                    {` · GPS ${formatGpsAge(c.locationAgeSeconds)}`}
                    {c.locationAccuracyM !== null ? ` · ±${Math.round(c.locationAccuracyM)} m` : ""}
                  </p>
                  {!c.eligibleForDispatch && c.ineligibilityReason && (
                    <span className="warning">⚠ {COURIER_INELIGIBILITY_LABELS[c.ineligibilityReason] ?? c.ineligibilityReason}</span>
                  )}
                  {c.activeOrder && <span className="hint"> · Pedido #{c.activeOrder.orderNumber}</span>}
                </div>
                <button disabled={busy || !c.eligibleForDispatch} onClick={() => assign(c.id)}>
                  {c.eligibleForDispatch ? "Escolher" : "Indisponível"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="link-btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
