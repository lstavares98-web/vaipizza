import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface AlertRow {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  order: { orderNumber: number } | null;
}

export default function RefundAlerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const load = useCallback(() => {
    api.get("/admin/refund-alerts", { params: { resolved: false } }).then(({ data }) => setAlerts(data.alerts));
  }, []);
  useEffect(load, [load]);

  async function resolve(id: string) {
    await api.post(`/admin/refund-alerts/${id}/resolve`);
    load();
  }

  if (alerts.length === 0) {
    return (
      <div>
        <h1>Alertas de Reembolso</h1>
        <p className="hint">Sem alertas por resolver.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Alertas de Reembolso</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Tipo</th>
            <th>Mensagem</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td>{a.order ? `#${a.order.orderNumber}` : "—"}</td>
              <td>{a.type}</td>
              <td>{a.message}</td>
              <td>{new Date(a.createdAt).toLocaleString("pt-PT")}</td>
              <td className="actions">
                <button onClick={() => resolve(a.id)}>Marcar resolvido</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
