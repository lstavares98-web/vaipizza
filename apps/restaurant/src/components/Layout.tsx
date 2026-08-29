import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Pedidos", end: true },
  { to: "/menu", label: "Cardápio" },
  { to: "/cash", label: "Caixa" },
  { to: "/reports", label: "Relatórios" },
  { to: "/settings", label: "Definições" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <nav className="navbar">
        <span className="brand">🏪 Yummix Restaurante</span>
        {user && (
          <div className="nav-links">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
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
