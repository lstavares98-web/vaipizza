import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

interface OrderItemModifier {
  id: string;
  nameSnapshot: string;
}
interface OrderItem {
  id: string;
  productNameSnapshot: string;
  secondaryProductNameSnapshot: string | null;
  quantity: number;
  notes: string | null;
  modifiers: OrderItemModifier[];
}
interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  createdAt: string;
  notes: string | null;
  items: OrderItem[];
}

const RELEVANT_STATUSES = "ACCEPTED,PREPARING,READY_FOR_PICKUP,WAITING_FOR_COURIER,COURIER_ASSIGNED";

export default function KdsBoard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/restaurant/orders", { params: { status: RELEVANT_STATUSES } }).then(({ data }) => setOrders(data.orders));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => load();
    socket.on("order:new", refresh);
    socket.on("order:status", refresh);
    return () => {
      socket.off("order:new", refresh);
      socket.off("order:status", refresh);
    };
  }, [load]);

  async function startPreparing(order: OrderRow) {
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "PREPARING" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function markReady(order: OrderRow) {
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "READY_FOR_PICKUP" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  const novos = orders.filter((o) => o.status === "ACCEPTED");
  const preparando = orders.filter((o) => o.status === "PREPARING");
  const prontos = orders.filter((o) => !["ACCEPTED", "PREPARING"].includes(o.status));

  return (
    <div className="kds-board">
      <Column title="NOVOS" count={novos.length}>
        {novos.map((o) => (
          <KdsCard key={o.id} order={o} now={now}>
            <button className="kds-btn" disabled={busyId === o.id} onClick={() => startPreparing(o)}>
              INICIAR PREPARAÇÃO
            </button>
          </KdsCard>
        ))}
      </Column>
      <Column title="EM PREPARAÇÃO" count={preparando.length}>
        {preparando.map((o) => (
          <KdsCard key={o.id} order={o} now={now}>
            <button className="kds-btn kds-btn-ready" disabled={busyId === o.id} onClick={() => markReady(o)}>
              PEDIDO PRONTO
            </button>
          </KdsCard>
        ))}
      </Column>
      <Column title="PRONTOS" count={prontos.length}>
        {prontos.map((o) => (
          <KdsCard key={o.id} order={o} now={now} done />
        ))}
      </Column>
    </div>
  );
}

function Column({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="kds-column">
      <h2>
        {title} <span className="kds-count">{count}</span>
      </h2>
      <div className="kds-column-body">{children}</div>
    </div>
  );
}

function KdsCard({ order, now, done, children }: { order: OrderRow; now: number; done?: boolean; children?: React.ReactNode }) {
  const elapsedMin = Math.round((now - new Date(order.createdAt).getTime()) / 60000);
  const urgent = elapsedMin >= 15 && !done;
  return (
    <div className={`kds-card ${urgent ? "kds-card-urgent" : ""} ${done ? "kds-card-done" : ""}`}>
      <div className="kds-card-header">
        <span className="kds-order-number">#{order.orderNumber}</span>
        <span className="kds-elapsed">{elapsedMin} min</span>
      </div>
      <ul className="kds-items">
        {order.items.map((item) => (
          <li key={item.id}>
            <strong>
              {item.quantity}x {item.productNameSnapshot}
              {item.secondaryProductNameSnapshot ? ` / ${item.secondaryProductNameSnapshot}` : ""}
            </strong>
            {item.modifiers.length > 0 && (
              <ul className="kds-modifiers">
                {item.modifiers.map((m) => (
                  <li key={m.id}>{m.nameSnapshot}</li>
                ))}
              </ul>
            )}
            {item.notes && <p className="kds-note">Obs: {item.notes}</p>}
          </li>
        ))}
      </ul>
      {order.notes && <p className="kds-note">OBS geral: "{order.notes}"</p>}
      {children}
    </div>
  );
}
