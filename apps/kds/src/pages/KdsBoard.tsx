import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playReadyBell } from "../lib/sound";

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

// The counter's single "Aceitar" click now moves an order straight to
// PREPARING (see orders.service.ts) — there is no separate "iniciar
// preparação" step anymore, so the kitchen only ever has one thing to do:
// ring the bell once a ticket is ready.
export default function KdsBoard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/restaurant/orders", { params: { status: "PREPARING" } }).then(({ data }) => setOrders(data.orders));
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

  async function ringBellAndMarkReady(order: OrderRow) {
    playReadyBell();
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "READY_FOR_PICKUP" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="ticket-board">
      {sorted.length === 0 && <p className="ticket-empty">Sem pedidos em preparação.</p>}
      {sorted.map((order) => {
        const elapsedMin = Math.round((now - new Date(order.createdAt).getTime()) / 60000);
        const urgent = elapsedMin >= 15;
        return (
          <div className={`ticket ${urgent ? "ticket-urgent" : ""}`} key={order.id}>
            <div className="ticket-header">
              <span className="ticket-number">#{order.orderNumber}</span>
              <span className="ticket-elapsed">{elapsedMin} min</span>
            </div>
            <ul className="ticket-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.quantity}x {item.productNameSnapshot}
                    {item.secondaryProductNameSnapshot ? ` / ${item.secondaryProductNameSnapshot}` : ""}
                  </strong>
                  {item.modifiers.length > 0 && (
                    <span className="ticket-modifiers">
                      {" — "}
                      {item.modifiers.map((m) => m.nameSnapshot).join(", ")}
                    </span>
                  )}
                  {item.notes && <p className="ticket-note">Obs: {item.notes}</p>}
                </li>
              ))}
            </ul>
            {order.notes && <p className="ticket-note">OBS geral: "{order.notes}"</p>}
            <button className="bell-btn" disabled={busyId === order.id} onClick={() => ringBellAndMarkReady(order)}>
              🔔 Tocar campainha — Pronto para recolha
            </button>
          </div>
        );
      })}
    </div>
  );
}
