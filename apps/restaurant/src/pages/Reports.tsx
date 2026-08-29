import { useState } from "react";
import { api } from "../lib/api";

interface ReportData {
  ordersTotal: number;
  ordersDelivered: number;
  ordersCancelled: number;
  revenue: number;
  avgTicket: number;
  topProducts: { name: string; count: number }[];
  topModifiersByGroup: { groupName: string; options: { name: string; count: number }[] }[];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export default function Reports() {
  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  async function runReport() {
    setLoading(true);
    try {
      const { data } = await api.get("/restaurant/reports", { params: { from, to } });
      setReport(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content">
      <h1>Relatórios</h1>
      <div className="toolbar">
        <label>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={runReport} disabled={loading}>
          {loading ? "A calcular..." : "Gerar relatório"}
        </button>
      </div>

      {report && (
        <>
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{report.ordersDelivered}</span>
              <span className="stat-label">Entregues</span>
            </div>
            <div className="stat">
              <span className="stat-value">{report.ordersCancelled}</span>
              <span className="stat-label">Cancelados</span>
            </div>
            <div className="stat">
              <span className="stat-value">{report.revenue.toFixed(2)} €</span>
              <span className="stat-label">Receita</span>
            </div>
            <div className="stat">
              <span className="stat-value">{report.avgTicket.toFixed(2)} €</span>
              <span className="stat-label">Ticket médio</span>
            </div>
          </div>

          <h2>Produtos mais vendidos</h2>
          <ul className="compact-list">
            {report.topProducts.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <span>{p.count}x</span>
              </li>
            ))}
            {report.topProducts.length === 0 && <li>Sem dados no período.</li>}
          </ul>

          {report.topModifiersByGroup.map((g) => (
            <div key={g.groupName}>
              <h2>{g.groupName} mais escolhidos</h2>
              <ul className="compact-list">
                {g.options.map((o) => (
                  <li key={o.name}>
                    <span>{o.name}</span>
                    <span>{o.count}x</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
