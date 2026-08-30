import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { CashIcon, LogoutIcon, MenuBookIcon, OrdersIcon, ReportsIcon, SettingsIcon } from "./NavIcons";

const NAV = [
  { to: "/", label: "Pedidos", end: true, Icon: OrdersIcon },
  { to: "/menu", label: "Cardápio", Icon: MenuBookIcon },
  { to: "/cash", label: "Caixa", Icon: CashIcon },
  { to: "/reports", label: "Relatórios", Icon: ReportsIcon },
  { to: "/settings", label: "Definições", Icon: SettingsIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="app-shell">
        <main>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-brand">
          <img src="/logo.png" alt="" className="sidebar-logo" />
          <span>
            <strong>VaiPizza</strong>
            <em>Restaurante</em>
          </span>
        </NavLink>
        <nav className="sidebar-nav">
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="hint">{user.name}</span>
          <button className="link-btn" onClick={logout}>
            <LogoutIcon />
            Sair
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <img src="/logo.png" alt="" className="sidebar-logo" style={{ width: 32, height: 32 }} />
          <strong>VaiPizza</strong>
        </header>
        <Outlet />
      </div>

      <nav className="admin-bottom-nav">
        {NAV.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon />
            {label}
          </NavLink>
        ))}
        <button onClick={logout}>
          <LogoutIcon />
          Sair
        </button>
      </nav>
    </div>
  );
}
