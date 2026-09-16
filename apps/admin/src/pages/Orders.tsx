import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import "./Orders.css";

interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: "DELIVERY" | "PICKUP";
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  user: { name: string; phone?: string | null; email?: string | null };
  courier: { user: { name: string } } | null;
}

interface OrderDetail extends OrderRow {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  amountTendered: number | null;
  changeDue: number | null;
  notes: string | null;
  rejectionReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  refundId: string | null;
  refundFailed: boolean;
  refundNeedsManualReview: boolean;
  lastRefundError: string | null;
  customerLat: number | null;
  customerLng: number | null;
  restaurant: { name: string; address: string };
  address: { line1: string; line2: string | null; city: string; postalCode: string | null; lat: number; lng: number } | null;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    secondaryProductNameSnapshot: string | null;
    comboSelectionsSnapshot: unknown;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string | null;
    modifiers: Array<{ id: string; nameSnapshot: string; priceDeltaSnapshot: number }>;
  }>;
  statusHistory: Array<{ id: string; status: string; actor: string | null; createdAt: string }>;
  courierAssignments: Array<{ id: string; status: string; createdAt: string }>;
}

const CANCELLABLE = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED"];
const STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "COLLECTED", "CANCELLED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Novo",
  ACCEPTED: "Aceite",
  PREPARING: "Em preparação",
  READY_FOR_PICKUP: "Pronto para recolha",
  WAITING_FOR_COURIER: "À espera de estafeta",
  COURIER_ASSIGNED: "Estafeta atribuído",
  PICKED_UP: "Recolhido",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  COLLECTED: "Recolhido pelo cliente",
  CANCELLED: "Cancelado",
};

function lisbonToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(lisbonToday);
  const [orderNumber, setOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isToday = date === lisbonToday();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const parsedOrderNumber = Number(orderNumber);
      const { data } = await api.get("/admin/orders", {
        params: {
          status: status || undefined,
          date: date || undefined,
          orderNumber: orderNumber.trim() && Number.isInteger(parsedOrderNumber) && parsedOrderNumber > 0 ? parsedOrderNumber : undefined,
        },
      });
      setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  }, [date, orderNumber, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api.get(`/admin/orders/${selectedId}`)
      .then(({ data }) => setDetail(data.order))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  async function forceCancel(id: string) {
    const reason = window.prompt("Motivo do cancelamento?") ?? "";
    if (!reason.trim()) return;
    await api.post(`/admin/orders/${id}/cancel`, { reason });
    await load();
    if (selectedId === id) {
      const { data } = await api.get(`/admin/orders/${id}`);
      setDetail(data.order);
    }
  }

  const total = useMemo(() => orders.reduce((sum, order) => sum + (order.status === "CANCELLED" ? 0 : order.total), 0), [orders]);

  return (
    <div className="admin-orders-page">
      <header className="admin-orders-heading">
        <div>
          <span className="admin-kicker">Histórico operacional</span>
          <h1>Pedidos</h1>
          <p>{isToday ? "Todos os pedidos de hoje, qualquer que seja o estado final." : `Pedidos de ${date || "todas as datas"}.`}</p>
        </div>
        <div className="admin-orders-summary">
          <strong>{orders.length}</strong>
          <span>pedidos · {total.toFixed(2)} €</span>
        </div>
      </header>

      <div className="orders-filter-panel">
        <label>
          <span>N.º do pedido</span>
          <input
            inputMode="numeric"
            placeholder="Ex.: 47"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label>
          <span>Data</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>Estado</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos os estados</option>
            {STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item] ?? item}</option>)}
          </select>
        </label>
        <button type="button" className="orders-today-btn" onClick={() => setDate(lisbonToday())} disabled={isToday}>
          Hoje
        </button>
      </div>

      <div className="orders-table-shell">
        {loading ? (
          <p className="orders-empty">A atualizar pedidos…</p>
        ) : orders.length === 0 ? (
          <p className="orders-empty">Nenhum pedido encontrado com estes filtros.</p>
        ) : (
          <table className="data-table admin-orders-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estafeta</th>
                <th>Estado</th>
                <th>Pagamento</th>
                <th>Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} onClick={() => setSelectedId(order.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelectedId(order.id)}>
                  <td><strong>#{order.orderNumber}</strong></td>
                  <td>{formatDateTime(order.createdAt).split(", ").at(-1)}</td>
                  <td>{order.user.name}</td>
                  <td>{order.fulfillmentType === "DELIVERY" ? "Entrega" : "Recolha"}</td>
                  <td>{order.courier?.user.name ?? "—"}</td>
                  <td><span className={`order-status-chip status-${order.status.toLowerCase()}`}>{STATUS_LABELS[order.status] ?? order.status}</span></td>
                  <td>{order.paymentMethod} · {order.paymentStatus}</td>
                  <td>{order.total.toFixed(2)} €</td>
                  <td className="actions">
                    {CANCELLABLE.includes(order.status) && (
                      <button
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void forceCancel(order.id);
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <div className="order-detail-backdrop" onMouseDown={() => setSelectedId(null)}>
          <aside className="order-detail-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Detalhe do pedido">
            <div className="order-detail-head">
              <div>
                <span className="admin-kicker">Consulta histórica</span>
                <h2>{detail ? `Pedido #${detail.orderNumber}` : "Pedido"}</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Fechar">×</button>
            </div>

            {detailLoading || !detail ? <p className="orders-empty">A carregar detalhe…</p> : <OrderDetailView order={detail} />}
          </aside>
        </div>
      )}
    </div>
  );
}

function OrderDetailView({ order }: { order: OrderDetail }) {
  return (
    <div className="order-detail-content">
      <section className="order-detail-grid">
        <Detail label="Estado" value={STATUS_LABELS[order.status] ?? order.status} />
        <Detail label="Criado" value={formatDateTime(order.createdAt)} />
        <Detail label="Cliente" value={`${order.user.name}${order.user.phone ? ` · ${order.user.phone}` : ""}`} />
        <Detail label="Estafeta" value={order.courier?.user.name ?? "Sem estafeta"} />
        <Detail label="Tipo" value={order.fulfillmentType === "DELIVERY" ? "Entrega" : "Recolha"} />
        <Detail label="Pagamento" value={`${order.paymentMethod} · ${order.paymentStatus}`} />
      </section>

      {order.fulfillmentType === "DELIVERY" && (
        <section className="order-detail-section">
          <h3>Entrega</h3>
          <p>{order.address ? [order.address.line1, order.address.line2, order.address.postalCode, order.address.city].filter(Boolean).join(", ") : "Morada guardada não disponível"}</p>
          {(order.customerLat !== null && order.customerLng !== null) && <small>Coordenadas: {order.customerLat.toFixed(6)}, {order.customerLng.toFixed(6)}</small>}
        </section>
      )}

      <section className="order-detail-section">
        <h3>Itens</h3>
        <div className="order-detail-items">
          {order.items.map((item) => (
            <article key={item.id}>
              <div><strong>{item.quantity}× {item.productNameSnapshot}{item.secondaryProductNameSnapshot ? ` / ${item.secondaryProductNameSnapshot}` : ""}</strong><b>{item.lineTotal.toFixed(2)} €</b></div>
              {item.modifiers.map((modifier) => <small key={modifier.id}>+ {modifier.nameSnapshot}{modifier.priceDeltaSnapshot ? ` (${modifier.priceDeltaSnapshot.toFixed(2)} €)` : ""}</small>)}
              {item.comboSelectionsSnapshot ? <small>Seleções de combo registadas no pedido</small> : null}
              {item.notes && <small>Obs.: {item.notes}</small>}
            </article>
          ))}
        </div>
      </section>

      <section className="order-detail-section order-money-grid">
        <Detail label="Subtotal" value={`${order.subtotal.toFixed(2)} €`} />
        <Detail label="Desconto" value={`${order.discount.toFixed(2)} €`} />
        <Detail label="Entrega" value={`${order.deliveryFee.toFixed(2)} €`} />
        <Detail label="Total" value={`${order.total.toFixed(2)} €`} />
        {order.paymentMethod === "CASH" && <Detail label="Cliente paga com" value={order.amountTendered === null ? "Não indicado" : `${order.amountTendered.toFixed(2)} €`} />}
        {order.paymentMethod === "CASH" && <Detail label="Troco" value={order.changeDue === null ? "—" : `${order.changeDue.toFixed(2)} €`} />}
      </section>

      {(order.notes || order.rejectionReason || order.cancelledAt) && (
        <section className="order-detail-section">
          <h3>Ocorrências</h3>
          {order.notes && <p><strong>Observações:</strong> {order.notes}</p>}
          {order.rejectionReason && <p><strong>Motivo:</strong> {order.rejectionReason}</p>}
          {order.cancelledAt && <p><strong>Cancelado:</strong> {formatDateTime(order.cancelledAt)} · {order.cancelledBy ?? "ator não registado"}</p>}
        </section>
      )}

      {(order.refundId || order.refundFailed || order.refundNeedsManualReview) && (
        <section className="order-detail-section warning-section">
          <h3>Reembolso</h3>
          <p>{order.refundId ? `ID: ${order.refundId}` : "Sem ID de reembolso"}</p>
          {order.refundNeedsManualReview && <p>Requer revisão manual.</p>}
          {order.lastRefundError && <p>{order.lastRefundError}</p>}
        </section>
      )}

      <section className="order-detail-section">
        <h3>Histórico de estados</h3>
        <ol className="order-history">
          {order.statusHistory.map((event) => (
            <li key={event.id}>
              <span>{STATUS_LABELS[event.status] ?? event.status}</span>
              <small>{formatDateTime(event.createdAt)}{event.actor ? ` · ${event.actor}` : ""}</small>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="order-detail-field"><span>{label}</span><strong>{value}</strong></div>;
}
