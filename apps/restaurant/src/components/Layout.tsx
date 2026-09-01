import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { CashIcon, LogoutIcon, MenuBookIcon, OrdersIcon, ReportsIcon, SettingsIcon } from "./NavIcons";

const NAV = [
  { to: "/", label: "Pedidos", end: true, Icon: OrdersIcon },
  { to: "/menu", label: "Menu", Icon: MenuBookIcon },
  { to: "/cash", label: "Caixa", Icon: CashIcon },
  { to: "/reports", label: "Relatórios", Icon: ReportsIcon },
  { to: "/settings", label: "Definições", Icon: SettingsIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();

  if (!user) {
    return <div className="app-shell"><main><Outlet /></main></div>;
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-brand">
          <img src="/logo.png" alt="VAIPIZZA" className="sidebar-logo" />
          <span><strong>VAIPIZZA</strong><em>Gestão</em></span>
        </NavLink>
        <div className="sidebar-caption">Operação</div>
        <nav className="sidebar-nav" aria-label="Gestão VAIPIZZA">
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end}><Icon /><span>{label}</span></NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="manager-chip"><span className="manager-avatar">{user.name?.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>Conta ativa</small></div></div>
          <button className="link-btn" onClick={logout}><LogoutIcon />Sair</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <NavLink to="/" className="mobile-brand"><img src="/logo.png" alt="" className="sidebar-logo" /><span><strong>VAIPIZZA</strong><small>Gestão</small></span></NavLink>
          <span className="mobile-user">{user.name}</span>
        </header>
        <Outlet />
      </div>

      <nav className="admin-bottom-nav" aria-label="Navegação de gestão">
        {NAV.map(({ to, label, end, Icon }) => <NavLink key={to} to={to} end={end}><Icon /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  );
}
