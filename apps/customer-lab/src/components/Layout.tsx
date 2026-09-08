import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { resolvePrimaryRestaurant, VAIPIZZA } from "../config/vaipizza";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { BagIcon, HomeIcon, LogoutIcon, PizzaIcon, ReceiptIcon, UserIcon } from "./NavIcons";

interface StoreContact {
  slug: string;
  phone?: string | null;
}

export default function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { items } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const isLanding = location.pathname === "/";

  useEffect(() => {
    api.get("/restaurants").then(({ data }) => {
      const store = resolvePrimaryRestaurant(data.restaurants as StoreContact[]);
      if (store?.phone) setWhatsapp(store.phone.replace(/[^\d+]/g, ""));
    }).catch(() => setWhatsapp(null));
  }, []);

  return (
    <div className={`app-shell${isLanding ? " landing-shell" : ""}`}>
      {!isLanding && (
        <header className="customer-topbar">
          <Link className="topbar-brand" to="/" aria-label="VAIPIZZA — início">
            <img src={VAIPIZZA.logoPath} alt="" />
            <span>
              <strong>{VAIPIZZA.name}</strong>
              <small>{VAIPIZZA.tagline}</small>
            </span>
          </Link>

          <nav className="topbar-links" aria-label="Navegação do cliente">
            <NavLink to={VAIPIZZA.orderPath} className={({ isActive }) => (isActive ? "active" : "")}>
              Pedir
            </NavLink>
            {user && (
              <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>
                Pedidos
              </NavLink>
            )}
          </nav>

          <div className="topbar-actions">
            {user ? (
              <>
                <NavLink className="topbar-icon-btn" to="/cart" aria-label={`Carrinho${cartCount ? `, ${cartCount} itens` : ""}`}>
                  <BagIcon />
                  {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
                </NavLink>
                <NavLink className="topbar-user" to="/profile">
                  <UserIcon />
                  <span>{user.name.split(" ")[0]}</span>
                </NavLink>
                <button className="topbar-icon-btn topbar-logout" onClick={logout} aria-label="Sair">
                  <LogoutIcon />
                </button>
              </>
            ) : (
              <Link className="topbar-login" to="/login">
                Entrar
              </Link>
            )}
          </div>
        </header>
      )}

      <div className="customer-content">
        <main>
          <Outlet />
        </main>
      </div>

      {!isLanding && (
        <nav className="bottom-nav" aria-label="Navegação móvel">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            <HomeIcon />
            Início
          </NavLink>
          <NavLink to={VAIPIZZA.orderPath} className={({ isActive }) => (isActive ? "active" : "")}>
            <PizzaIcon />
            Pedir
          </NavLink>
          {user ? (
            <>
              <NavLink to="/cart" className={({ isActive }) => (isActive ? "active" : "")}>
                <BagIcon />
                Carrinho
                {cartCount > 0 && <span className="nav-dot" />}
              </NavLink>
              <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>
                <ReceiptIcon />
                Pedidos
              </NavLink>
              <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
                <UserIcon />
                Perfil
              </NavLink>
            </>
          ) : (
            <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : "")}>
              <UserIcon />
              Entrar
            </NavLink>
          )}
        </nav>
      )}

      {whatsapp && !isLanding && (
        <a
          className="whatsapp-fab"
          href={`https://wa.me/${whatsapp.replace("+", "")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Fale connosco no WhatsApp"
        >
          <span className="whatsapp-fab-label">Fale connosco</span>
          <span className="whatsapp-fab-icon">
            <img src={VAIPIZZA.logoPath} alt="" />
          </span>
        </a>
      )}
    </div>
  );
}
