import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import BrandMark from "./BrandMark";

export default function Layout() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <span />
        <NavLink to="/" className="brand">
          <BrandMark size={36} />
          VaiPizza
        </NavLink>
        <div className="nav-links">
          {user ? (
            <>
              <NavLink to="/cart" className="cart-btn">
                🛍️
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </NavLink>
            </>
          ) : (
            <NavLink to="/login">Entrar</NavLink>
          )}
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
      <div className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="nav-icon">🏠</span>
          Início
        </NavLink>
        <NavLink to="/cart" className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="nav-icon">🛍️</span>
          Carrinho
          {cartCount > 0 && <span className="nav-dot" />}
        </NavLink>
        {user ? (
          <>
            <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="nav-icon">🧾</span>
              Pedidos
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="nav-icon">👤</span>
              Perfil
            </NavLink>
            <button onClick={logout}>
              <span className="nav-icon">↩️</span>
              Sair
            </button>
          </>
        ) : (
          <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="nav-icon">👤</span>
            Entrar
          </NavLink>
        )}
      </div>
    </div>
  );
}
