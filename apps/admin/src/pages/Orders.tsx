import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  user: { name: string };
  courier: { user: { name: string } } | null;
}

const CANCELLABLE = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED"];

export default function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    api.get("/admin/orders", { params: { status: status || undefined } }).then(({ data }) => setOrders(data.orders));
  }, [status]);
  useEffect(load, [load]);

  async function forceCancel(id: string) {
    const reason = window.prompt("Motivo do cancelamento?") ?? "";
    if (!reason.trim()) return;
    await api.post(`/admin/orders/${id}/cancel`, { reason });
    load();
  }

  return (
    <div>
      <h1>Pedidos</h1>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os estados</option>
          {["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "COLLECTED", "CANCELLED"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Estafeta</th>
            <th>Estado</th>
            <th>Pagamento</th>
            <th>Total</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>#{o.orderNumber}</td>
              <td>{o.user.name}</td>
              <td>{o.courier?.user.name ?? "—"}</td>
              <td>
                <span className="badge">{o.status}</span>
              </td>
              <td>{o.paymentStatus}</td>
              <td>{o.total.toFixed(2)} €</td>
              <td className="actions">
                {CANCELLABLE.includes(o.status) && (
                  <button className="danger" onClick={() => forceCancel(o.id)}>
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
