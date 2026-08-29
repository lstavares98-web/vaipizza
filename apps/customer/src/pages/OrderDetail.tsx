import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { CANCELLABLE_STATUSES, ORDER_STATUS_LABELS } from "../lib/orderLabels";

interface OrderDetailView {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: "DELIVERY" | "PICKUP";
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  restaurant: { name: string };
  courier: { user: { name: string; phone: string | null } } | null;
  items: { id: string; productNameSnapshot: string; quantity: number; lineTotal: number }[];
  statusHistory: { status: string; createdAt: string }[];
}

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderDetailView | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data.order));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (payload: { orderId: string }) => {
      if (payload.orderId === id) load();
    };
    socket.on("order:status", handler);
    return () => {
      socket.off("order:status", handler);
    };
  }, [id, load]);

  if (!order) return <p className="page">A carregar pedido...</p>;

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.post(`/orders/${order!.id}/cancel`);
      load();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="page">
      <h1>Pedido #{order.orderNumber}</h1>
      <p className="muted">{order.restaurant.name}</p>
      <p className="badge">{ORDER_STATUS_LABELS[order.status] ?? order.status}</p>

      {order.courier && (
        <p>
          Estafeta: {order.courier.user.name}
          {order.courier.user.phone ? ` — ${order.courier.user.phone}` : ""}
        </p>
      )}

      <section className="modifier-group">
        <h3>Itens</h3>
        <ul className="cart-list">
          {order.items.map((item) => (
            <li key={item.id} className="cart-item">
              <span>
                {item.quantity}x {item.productNameSnapshot}
              </span>
              <span className="price">{item.lineTotal.toFixed(2)} €</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="modifier-group">
        <h3>Resumo</h3>
        <div className="cart-summary" style={{ fontWeight: 400 }}>
          <span>Subtotal</span>
          <span>{order.subtotal.toFixed(2)} €</span>
        </div>
        {order.discount > 0 && (
          <div className="cart-summary" style={{ fontWeight: 400 }}>
            <span>Desconto</span>
            <span>-{order.discount.toFixed(2)} €</span>
          </div>
        )}
        {order.fulfillmentType === "DELIVERY" && (
          <div className="cart-summary" style={{ fontWeight: 400 }}>
            <span>Entrega</span>
            <span>{order.deliveryFee.toFixed(2)} €</span>
          </div>
        )}
        <div className="cart-summary">
          <span>Total</span>
          <span>{order.total.toFixed(2)} €</span>
        </div>
      </section>

      <section className="modifier-group">
        <h3>Histórico</h3>
        <ul className="cart-item-modifiers" style={{ paddingLeft: "1.1rem" }}>
          {order.statusHistory.map((h, i) => (
            <li key={i}>
              {ORDER_STATUS_LABELS[h.status] ?? h.status} — {new Date(h.createdAt).toLocaleString("pt-PT")}
            </li>
          ))}
        </ul>
      </section>

      {CANCELLABLE_STATUSES.has(order.status) && (
        <button className="link-danger" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "A cancelar..." : "Cancelar pedido"}
        </button>
      )}

      <p>
        <Link to="/orders">← Voltar aos meus pedidos</Link>
      </p>
    </div>
  );
}
