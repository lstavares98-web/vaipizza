import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="kds-shell">
      <header className="kds-header">
        <span className="kds-brand">YUMMIX KDS</span>
        {user && (
          <div className="kds-header-right">
            <span>{user.name}</span>
            <button className="kds-logout" onClick={logout}>
              Sair
            </button>
          </div>
        )}
      </header>
      <Outlet />
    </div>
  );
}
