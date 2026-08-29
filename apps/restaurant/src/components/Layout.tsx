import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <nav className="navbar">
        <span className="brand">🏪 Yummix Restaurante</span>
        {user && (
          <div className="nav-links">
            <span className="hint">{user.name}</span>
            <button className="link-btn" onClick={logout}>
              Sair
            </button>
          </div>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
