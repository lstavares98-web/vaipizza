import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playNewOrderChime } from "../lib/sound";
import { ORDER_STATUS_LABELS } from "../lib/orderLabels";

interface OrderItem {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  lineTotal: number;
}
interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: "DELIVERY" | "PICKUP";
  total: number;
  createdAt: string;
  notes: string | null;
  items: OrderItem[];
}

const ACTIVE_EARLY = ["NEW", "ACCEPTED", "PREPARING"];
const READY_STAGE = ["READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];
const DONE_STAGE = ["DELIVERED", "COLLECTED", "CANCELLED"];

export default function OrdersDashboard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    .filter((o) => DONE_STAGE.includes(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todays = orders.filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== "CANCELLED");
    const revenue = todays.reduce((sum, o) => sum + o.total, 0);
    return { count: todays.length, revenue, avgTicket: todays.length ? revenue / todays.length : 0 };
  }, [orders]);

  async function accept(order: OrderRow) {
    const prepTimeMinutes = Number(window.prompt("Tempo de preparação estimado (minutos)?", "20") ?? "");
    if (!prepTimeMinutes || prepTimeMinutes <= 0) return;
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "ACCEPTED", prepTimeMinutes });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(order: OrderRow) {
    const rejectionReason = window.prompt("Motivo da rejeição?") ?? "";
    if (!rejectionReason.trim()) return;
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "CANCELLED", rejectionReason });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="dashboard">
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

      <div className="board">
        <Column title={`Novos (${newOrders.length})`}>
          {newOrders.map((o) => (
            <OrderCard key={o.id} order={o}>
              <div className="card-actions">
                <button disabled={busyId === o.id} onClick={() => accept(o)}>
                  Aceitar
                </button>
                <button className="danger" disabled={busyId === o.id} onClick={() => reject(o)}>
                  Rejeitar
                </button>
              </div>
            </OrderCard>
          ))}
        </Column>

        <Column title={`Em preparação (${preparing.length})`}>
          {preparing.map((o) => (
            <OrderCard key={o.id} order={o}>
              <p className="hint">Na cozinha (KDS)</p>
            </OrderCard>
          ))}
        </Column>

        <Column title={`Prontos / A caminho (${ready.length})`}>
          {ready.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </Column>

        <Column title="Concluídos (últimos 20)">
          {done.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </Column>
      </div>
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
    <div className="order-card">
      <div className="order-card-header">
        <strong>#{order.orderNumber}</strong>
        <span className="hint">{elapsedMin} min</span>
      </div>
      <span className="badge">{order.fulfillmentType === "DELIVERY" ? "Entrega" : "Recolha"}</span>
      <ul>
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.productNameSnapshot}
          </li>
        ))}
      </ul>
      {order.notes && <p className="hint">Obs: {order.notes}</p>}
      <p className="price">{order.total.toFixed(2)} €</p>
      <p className="hint">{ORDER_STATUS_LABELS[order.status] ?? order.status}</p>
      {children}
    </div>
  );
}
