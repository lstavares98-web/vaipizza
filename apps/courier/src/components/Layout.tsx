import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isDeliveryRoute, shouldShowBottomNav } from "../lib/layoutPresentation";

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.7h-6v-6h-6v6H3z" /></svg>;
}
function WalletIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h14.5A1.5 1.5 0 0 1 20 8v9.5a1.5 1.5 0 0 1-1.5 1.5h-14A2.5 2.5 0 0 1 2 16.5v-11A2.5 2.5 0 0 1 4.5 3H18v3.5H4a.5.5 0 0 0 0 1Zm12 5.5h4v3h-4a1.5 1.5 0 0 1 0-3Z" /></svg>;
}
function HistoryIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-7.2 4.5H2l3.5-3.7L9 8.5H6.9A6 6 0 1 0 12 6Zm-1 3h2v5l3.5 2-1 1.7-4.5-2.6Z" /></svg>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const deliveryMode = isDeliveryRoute(location.pathname);
  const showBottomNav = shouldShowBottomNav(Boolean(user), location.pathname);
  return (
    <div className={`app-shell ${deliveryMode ? "delivery-mode" : ""}`}>
      <header className="top-bar">
        <NavLink to="/" className="brand" aria-label="VAIPIZZA Estafeta">
          <img src="/logo.png" alt="" className="brand-logo" />
          <span>
            <strong>VAIPIZZA</strong>
            <small>Estafeta</small>
          </span>
        </NavLink>
        {user && <button className="link-btn logout-btn" onClick={logout}>Sair</button>}
      </header>
      <main className="courier-main"><Outlet /></main>
      {showBottomNav && (
        <nav className="bottom-nav" aria-label="Navegação do estafeta">
          <NavLink to="/" end><HomeIcon /><span>Início</span></NavLink>
          <NavLink to="/earnings"><WalletIcon /><span>Ganhos</span></NavLink>
          <NavLink to="/history"><HistoryIcon /><span>Histórico</span></NavLink>
        </nav>
      )}
    </div>
  );
}
