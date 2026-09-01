import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="kds-shell">
      <header className="kds-header">
        <div className="kds-brand-wrap">
          <img src="/logo.png" alt="VAIPIZZA" className="kds-logo" />
          <div>
            <span className="kds-brand">VAIPIZZA</span>
            <small>Cozinha</small>
          </div>
        </div>
        {user && (
          <div className="kds-header-right">
            <span className="kds-user">{user.name}</span>
            <button className="kds-logout" onClick={logout}>Sair</button>
          </div>
        )}
      </header>
      <Outlet />
    </div>
  );
}
