import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ORDER_STATUS_LABELS } from "../lib/orderLabels";

interface OrderListItem {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  createdAt: string;
  restaurant: { name: string };
}

export default function Orders() {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);

  useEffect(() => {
    api.get("/orders").then(({ data }) => setOrders(data.orders));
  }, []);

  if (orders === null) return <p className="page">A carregar pedidos...</p>;

  if (orders.length === 0) {
    return (
      <div className="page empty-state">
        <h1>Ainda não fez nenhum pedido</h1>
        <Link to="/restaurants">Procurar restaurantes</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Meus Pedidos</h1>
      <ul className="cart-list">
        {orders.map((o) => (
          <li key={o.id} className="cart-item">
            <Link to={`/orders/${o.id}`} className="cart-item-main">
              <strong>
                #{o.orderNumber} — {o.restaurant.name}
              </strong>
              <p className="muted">
                {new Date(o.createdAt).toLocaleString("pt-PT")} · {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </p>
            </Link>
            <span className="price">{o.total.toFixed(2)} €</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
