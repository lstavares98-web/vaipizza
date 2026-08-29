import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface HistoryOrder {
  id: string;
  orderNumber: number;
  total: number;
  deliveredAt: string | null;
  restaurant: { name: string };
}

export default function History() {
  const [orders, setOrders] = useState<HistoryOrder[] | null>(null);

  useEffect(() => {
    api.get("/courier/history").then(({ data }) => setOrders(data.orders));
  }, []);

  if (!orders) return <p className="page">A carregar...</p>;
  if (orders.length === 0) {
    return (
      <div className="page empty-state">
        <h1>Sem entregas ainda</h1>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Histórico</h1>
      <ul className="history-list">
        {orders.map((o) => (
          <li key={o.id}>
            <div>
              <strong>#{o.orderNumber} — {o.restaurant.name}</strong>
              <p className="hint">{o.deliveredAt ? new Date(o.deliveredAt).toLocaleString("pt-PT") : ""}</p>
            </div>
            <span className="price">{o.total.toFixed(2)} €</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
