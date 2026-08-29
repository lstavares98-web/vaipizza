import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";

interface DashboardData {
  orderCount: number;
  gmv: number;
  platformCommission: number;
  restaurantPayout: number;
  deliveryFees: number;
  restaurantCount: number;
  customerCount: number;
  courierCount: number;
  pendingRestaurants: number;
  pendingCouriers: number;
  unresolvedAlerts: number;
  revenueByDay: { date: string; revenue: number }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get("/admin/dashboard").then(({ data }) => setData(data));
  }, []);

  if (!data) return <p>A carregar...</p>;

  return (
    <div>
      <h1>Dashboard</h1>

      {(data.pendingRestaurants > 0 || data.pendingCouriers > 0 || data.unresolvedAlerts > 0) && (
        <div className="alert-banner">
          {data.pendingRestaurants > 0 && <span>{data.pendingRestaurants} restaurante(s) pendentes</span>}
          {data.pendingCouriers > 0 && <span>{data.pendingCouriers} estafeta(s) pendentes</span>}
          {data.unresolvedAlerts > 0 && <span>{data.unresolvedAlerts} alerta(s) de reembolso</span>}
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="GMV" value={`${data.gmv.toFixed(2)} €`} />
        <StatCard label="Comissão da plataforma" value={`${data.platformCommission.toFixed(2)} €`} />
        <StatCard label="Repasse aos restaurantes" value={`${data.restaurantPayout.toFixed(2)} €`} />
        <StatCard label="Taxas de entrega" value={`${data.deliveryFees.toFixed(2)} €`} />
        <StatCard label="Pedidos" value={data.orderCount} />
        <StatCard label="Restaurantes ativos" value={data.restaurantCount} />
        <StatCard label="Clientes" value={data.customerCount} />
        <StatCard label="Estafetas ativos" value={data.courierCount} />
      </div>

      <h2>Receita (últimos 30 dias)</h2>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.revenueByDay}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `${v.toFixed(2)} €`} />
            <Line type="monotone" dataKey="revenue" stroke="#a51f10" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
