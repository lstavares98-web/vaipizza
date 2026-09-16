import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import "./Dashboard.css";

type DashboardPeriod = "today" | "7d" | "15d" | "30d";

interface DashboardData {
  period: DashboardPeriod;
  orderCount: number;
  gmv: number;
  averageTicket: number;
  platformCommission: number;
  restaurantPayout: number;
  deliveryFees: number;
  customerCount: number;
  courierCount: number;
  pendingCouriers: number;
  unresolvedAlerts: number;
  installation: { id: string; name: string; email: string; status: string; combosEnabled: boolean } | null;
  trend: { date: string; orders: number; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  topCombos: { name: string; quantity: number; revenue: number }[];
  fulfillmentMix: { type: "DELIVERY" | "PICKUP"; count: number }[];
  pendingCash: {
    total: number;
    courierCount: number;
    couriers: {
      courierId: string;
      courierName: string;
      total: number;
      orders: { orderId: string; orderNumber: number; amount: number }[];
    }[];
  };
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "15d": "15 dias",
  "30d": "30 dias",
};

const PIE_COLORS = ["#0b4d2b", "#f5a000"];

export default function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/admin/dashboard", { params: { period } })
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, [period]);

  if (!data) return <p>A carregar dashboard…</p>;

  const fulfillmentData = data.fulfillmentMix.map((item) => ({
    name: item.type === "DELIVERY" ? "Entrega" : "Recolha",
    value: item.count,
  }));

  return (
    <div className="ops-dashboard">
      <header className="ops-dashboard-head">
        <div>
          <span className="admin-kicker">Operação VaiPizza</span>
          <h1>Dashboard</h1>
          <p>Vendas, operação e alertas num resumo rápido.</p>
        </div>
        <div className="dashboard-periods" aria-label="Período do dashboard">
          {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((value) => (
            <button
              type="button"
              key={value}
              className={period === value ? "active" : ""}
              onClick={() => setPeriod(value)}
              disabled={loading && period === value}
            >
              {PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
      </header>

      {(data.pendingCouriers > 0 || data.unresolvedAlerts > 0) && (
        <div className="dashboard-alert-strip">
          {data.pendingCouriers > 0 && <span>{data.pendingCouriers} estafeta(s) por validar</span>}
          {data.unresolvedAlerts > 0 && <span>{data.unresolvedAlerts} alerta(s) de reembolso</span>}
        </div>
      )}

      {data.pendingCash.total > 0 && (
        <section className="pending-cash-card">
          <button type="button" className="pending-cash-summary" onClick={() => setCashOpen((current) => !current)} aria-expanded={cashOpen}>
            <div>
              <span>Dinheiro por receber dos estafetas</span>
              <strong>{data.pendingCash.total.toFixed(2)} €</strong>
              <small>{data.pendingCash.courierCount} estafeta(s) com valores por acertar</small>
            </div>
            <span className="pending-cash-action">{cashOpen ? "Ocultar detalhe" : "Ver detalhe"}</span>
          </button>
          {cashOpen && (
            <div className="pending-cash-breakdown">
              {data.pendingCash.couriers.map((courier) => (
                <article key={courier.courierId}>
                  <div>
                    <strong>{courier.courierName}</strong>
                    <b>{courier.total.toFixed(2)} €</b>
                  </div>
                  <p>{courier.orders.map((order) => `#${order.orderNumber} · ${order.amount.toFixed(2)} €`).join("  •  ")}</p>
                </article>
              ))}
              <small>O acerto continua a ser confirmado na Gestão pelo restaurante. Este aviso não bloqueia o estafeta.</small>
            </div>
          )}
        </section>
      )}

      <section className="dashboard-kpis" aria-label={`Resumo de ${PERIOD_LABELS[period]}`}>
        <Kpi label="Pedidos" value={data.orderCount.toString()} />
        <Kpi label="Faturação" value={`${data.gmv.toFixed(2)} €`} />
        <Kpi label="Ticket médio" value={`${data.averageTicket.toFixed(2)} €`} />
        <Kpi label="Taxas de entrega" value={`${data.deliveryFees.toFixed(2)} €`} />
        <Kpi label="Comissão" value={`${data.platformCommission.toFixed(2)} €`} />
        <Kpi label="Repasse restaurante" value={`${data.restaurantPayout.toFixed(2)} €`} />
      </section>

      <div className="dashboard-chart-grid">
        <ChartCard title="Evolução" subtitle={`${PERIOD_LABELS[period]} · faturação e pedidos`} className="wide">
          {data.trend.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={data.trend} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => value.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number, name: string) => name === "revenue" ? [`${Number(value).toFixed(2)} €`, "Faturação"] : [value, "Pedidos"]} />
                <Bar dataKey="revenue" name="revenue" fill="#0b4d2b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Entrega vs recolha" subtitle="Distribuição dos pedidos">
          {fulfillmentData.every((item) => item.value === 0) ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={290}>
              <PieChart>
                <Pie data={fulfillmentData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={3}>
                  {fulfillmentData.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [value, "Pedidos"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="mix-legend">
            {fulfillmentData.map((item) => <span key={item.name}><b>{item.value}</b> {item.name}</span>)}
          </div>
        </ChartCard>

        <ChartCard title="Mais pedidos" subtitle="Top 5 produtos por quantidade">
          {data.topProducts.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topProducts} layout="vertical" margin={{ top: 4, right: 10, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [value, "Unidades"]} />
                <Bar dataKey="quantity" fill="#a51f10" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Combos" subtitle="Top combos no período">
          {data.topCombos.length === 0 ? (
            <div className="dashboard-empty-chart"><strong>Sem vendas de combos</strong><span>Nada a mostrar neste período.</span></div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topCombos} layout="vertical" margin={{ top: 4, right: 10, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [value, "Unidades"]} />
                <Bar dataKey="quantity" fill="#f5a000" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <section className="dashboard-foot-stats">
        <span><strong>{data.customerCount}</strong> clientes registados</span>
        <span><strong>{data.courierCount}</strong> estafetas aprovados</span>
        {data.installation && <span><strong>{data.installation.name}</strong> instalação ativa</span>}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <article className="dashboard-kpi"><span>{label}</span><strong>{value}</strong></article>;
}

function ChartCard({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`dashboard-chart-card ${className}`}>
      <header><div><h2>{title}</h2><p>{subtitle}</p></div></header>
      {children}
    </section>
  );
}

function EmptyChart() {
  return <div className="dashboard-empty-chart"><strong>Sem dados</strong><span>Ainda não há pedidos neste período.</span></div>;
}
