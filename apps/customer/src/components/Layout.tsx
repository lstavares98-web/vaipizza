import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { BagIcon, HomeIcon, LogoutIcon, ReceiptIcon, UserIcon } from "./NavIcons";

export default function Layout() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <span />
        <NavLink to="/" className="brand">
          <img src="/logo.png" alt="VaiPizza" className="brand-logo" />
        </NavLink>
        <div className="nav-links">
          {user ? (
            <>
              <NavLink to="/cart" className="cart-btn">
                <BagIcon />
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
          <HomeIcon />
          Início
        </NavLink>
        <NavLink to="/cart" className={({ isActive }) => (isActive ? "active" : "")}>
          <BagIcon />
          Carrinho
          {cartCount > 0 && <span className="nav-dot" />}
        </NavLink>
        {user ? (
          <>
            <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>
              <ReceiptIcon />
              Pedidos
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              <UserIcon />
              Perfil
            </NavLink>
            <button onClick={logout}>
              <LogoutIcon />
              Sair
            </button>
          </>
        ) : (
          <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : "")}>
            <UserIcon />
            Entrar
          </NavLink>
        )}
      </div>
    </div>
  );
}
