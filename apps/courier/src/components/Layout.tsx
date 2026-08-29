import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="brand">🛵 Yummix</span>
        {user && (
          <button className="link-btn" onClick={logout}>
            Sair
          </button>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      {user && (
        <nav className="bottom-nav">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/earnings">Ganhos</NavLink>
          <NavLink to="/history">Histórico</NavLink>
        </nav>
      )}
    </div>
  );
}
