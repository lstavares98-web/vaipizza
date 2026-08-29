import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <Link to="/restaurants" className="brand">
          🍔 Yummix
        </Link>
        <div className="nav-links">
          {user ? (
            <>
              <Link to="/orders">Meus Pedidos</Link>
              <Link to="/cart">Carrinho{cartCount > 0 ? ` (${cartCount})` : ""}</Link>
              <Link to="/profile">Perfil</Link>
              <button className="link-btn" onClick={logout}>
                Sair
              </button>
            </>
          ) : (
            <Link to="/login">Entrar</Link>
          )}
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
