import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/features", label: "Funcionalidades" },
  { to: "/franchises", label: "Franquias" },
  { to: "/couriers", label: "Estafetas" },
  { to: "/customers", label: "Clientes" },
  { to: "/orders", label: "Pedidos" },
  { to: "/refund-alerts", label: "Alertas de Reembolso" },
  { to: "/feedback", label: "Feedback" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="" />
          <span><strong>VAIPIZZA</strong><small>Admin técnico</small></span>
        </div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="sidebar-footer">
            <span className="hint">{user.name}</span>
            <button className="link-btn" onClick={logout}>
              Sair
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
