import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playReadyBell } from "../lib/sound";
import { getFulfillmentLabel, getPreparationElapsedMinutes, getTicketUrgency, type StatusHistoryEntry } from "../lib/kdsPresentation";

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
  comboSelectionsSnapshot: {
    fixedItems?: { productName: string; quantity: number }[];
    selectedOptions?: { groupName: string; productName: string }[];
  } | null;
}
interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType?: "DELIVERY" | "PICKUP";
  createdAt: string;
  notes: string | null;
  items: OrderItem[];
  statusHistory?: StatusHistoryEntry[];
}

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

  async function markReady(order: OrderRow) {
    setBusyId(order.id);
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "READY_FOR_PICKUP" });
      playReadyBell();
      load();
    } finally {
      setBusyId(null);
    }
  }

  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <main className="kds-main">
      <section className="kds-summary" aria-label="Resumo da cozinha">
        <div>
          <p className="kds-eyebrow">Produção em tempo real</p>
          <h1>Cozinha</h1>
        </div>
        <div className="kds-count" aria-live="polite">
          <strong>{sorted.length}</strong>
          <span>{sorted.length === 1 ? "pedido em preparação" : "pedidos em preparação"}</span>
        </div>
      </section>

      <div className="ticket-board">
        {sorted.length === 0 && (
          <div className="ticket-empty">
            <span className="ticket-empty-icon">✓</span>
            <h2>Cozinha em dia</h2>
            <p>Os novos pedidos aparecem aqui automaticamente.</p>
          </div>
        )}

        {sorted.map((order) => {
          const elapsedMin = getPreparationElapsedMinutes(order, now);
          const urgency = getTicketUrgency(elapsedMin);
          const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);

          return (
            <article className={`ticket ticket-${urgency.level}`} key={order.id}>
              <header className="ticket-header">
                <div>
                  <span className="ticket-number">#{order.orderNumber}</span>
                  <span className="ticket-type">{getFulfillmentLabel(order.fulfillmentType)}</span>
                </div>
                <div className="ticket-time">
                  <span className={`urgency-pill urgency-${urgency.level}`}>{urgency.label}</span>
                  <strong>{elapsedMin} min</strong>
                </div>
              </header>

              <div className="ticket-meta">{itemCount} {itemCount === 1 ? "item" : "itens"}</div>

              <ul className="ticket-items">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <div className="ticket-product-line">
                      <span className="ticket-quantity">{item.quantity}×</span>
                      <strong>
                        {item.productNameSnapshot}
                        {item.secondaryProductNameSnapshot ? ` / ${item.secondaryProductNameSnapshot}` : ""}
                      </strong>
                    </div>
                    {item.comboSelectionsSnapshot && (
                      <ul className="ticket-modifiers combo-ticket-lines">
                        {(item.comboSelectionsSnapshot.fixedItems ?? []).map((fixed, index) => (
                          <li key={`fixed-${index}`}>{fixed.quantity}x {fixed.productName}</li>
                        ))}
                        {(item.comboSelectionsSnapshot.selectedOptions ?? []).map((selected, index) => (
                          <li key={`selected-${index}`}><strong>{selected.groupName}:</strong> {selected.productName}</li>
                        ))}
                      </ul>
                    )}
                    {item.modifiers.length > 0 && (
                      <ul className="ticket-modifiers">
                        {item.modifiers.map((modifier) => (
                          <li key={modifier.id}>{modifier.nameSnapshot}</li>
                        ))}
                      </ul>
                    )}
                    {item.notes && <p className="ticket-note"><span>Item</span>{item.notes}</p>}
                  </li>
                ))}
              </ul>

              {order.notes && <p className="ticket-note ticket-note-general"><span>Pedido</span>{order.notes}</p>}

              <button className="bell-btn" disabled={busyId === order.id} onClick={() => markReady(order)}>
                <span className="ready-check">✓</span>
                <span>{busyId === order.id ? "A confirmar..." : "PRONTO"}</span>
              </button>
            </article>
          );
        })}
      </div>
    </main>
  );
}
