import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface EarningsSummary {
  totalEarnings: number;
  lifetimeDeliveries: number;
  avgRating: number;
  last7Days: { date: string; amount: number }[];
}

export default function Earnings() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);

  useEffect(() => {
    api.get("/courier/earnings").then(({ data }) => setSummary(data));
  }, []);

  if (!summary) return <p className="page">A carregar...</p>;

  const max = Math.max(1, ...summary.last7Days.map((d) => d.amount));

  return (
    <div className="page">
      <h1>Ganhos</h1>
      <div className="stats-row">
        <div className="stat-box">
          <span className="stat-value">{summary.totalEarnings.toFixed(2)} €</span>
          <span className="hint">Total acumulado</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{summary.lifetimeDeliveries}</span>
          <span className="hint">Entregas</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">⭐ {summary.avgRating.toFixed(1)}</span>
          <span className="hint">Avaliação</span>
        </div>
      </div>

      <h2>Últimos 7 dias</h2>
      <div className="chart">
        {summary.last7Days.length === 0 ? (
          <p className="hint">Sem ganhos nos últimos 7 dias.</p>
        ) : (
          summary.last7Days.map((d) => (
            <div className="chart-row" key={d.date}>
              <span className="chart-label">{d.date.slice(5)}</span>
              <div className="chart-bar-track">
                <div className="chart-bar" style={{ width: `${(d.amount / max) * 100}%` }} />
              </div>
              <span className="chart-value">{d.amount.toFixed(2)} €</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
