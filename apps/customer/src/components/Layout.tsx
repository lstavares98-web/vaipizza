import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { BagIcon, HomeIcon, LogoutIcon, PhoneIcon, PinIcon, ReceiptIcon, UserIcon } from "./NavIcons";

interface SidebarInfo {
  phone: string | null;
  address: string | null;
  isOpen: boolean;
  todayHours: string | null;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [info, setInfo] = useState<SidebarInfo | null>(null);

  useEffect(() => {
    // Only one restaurant runs on the platform for now (see Home.tsx), so
    // the sidebar's contact/hours block just reads restaurants[0] rather
    // than needing to know which restaurant is currently being browsed.
    api.get("/restaurants").then(({ data }) => {
      const r = data.restaurants[0] as
        | { phone?: string; address?: string; isOpen?: boolean; todayHours?: string | null }
        | undefined;
      if (!r) return;
      if (r.phone) setWhatsapp(r.phone.replace(/[^\d+]/g, ""));
      setInfo({
        phone: r.phone ?? null,
        address: r.address ?? null,
        isOpen: r.isOpen ?? true,
        todayHours: r.todayHours ?? null,
      });
    });
  }, []);

  // Shared between the desktop sidebar and the mobile floating nav so the
  // two never drift apart.
  const navItems = (
    <>
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
    </>
  );

  return (
    <div className="app-shell">
      {/* Desktop only — hidden under 900px in favour of the top navbar + floating bottom nav. */}
      <aside className="customer-sidebar">
        <NavLink to="/" className="sidebar-brand">
          <img src="/logo.png" alt="" className="sidebar-logo" />
          <span>
            <strong>VaiPizza</strong>
            <em>Pediu? Vai.</em>
          </span>
        </NavLink>
        <nav className="sidebar-nav">{navItems}</nav>

        {/* Fills the empty space below the nav with real info instead of
            leaving a bare panel of colour — same spot the reference design
            uses, but with data we actually have (no invented content). */}
        {info && (
          <div className="sidebar-info">
            <span className={`sidebar-info-status${info.isOpen ? "" : " closed"}`}>
              {info.isOpen ? "Aberto agora" : "Fechado agora"}
            </span>
            {info.todayHours && <p className="sidebar-info-hours">Hoje: {info.todayHours}</p>}
            {info.address && (
              <p className="sidebar-info-row">
                <PinIcon />
                <span>{info.address}</span>
              </p>
            )}
            {info.phone && (
              <a className="sidebar-info-row" href={`tel:${info.phone}`}>
                <PhoneIcon />
                <span>{info.phone}</span>
              </a>
            )}
          </div>
        )}
      </aside>

      <div className="customer-content">
        <nav className="navbar">
          <span />
          <NavLink to="/" className="brand">
            <img src="/logo.png" alt="VaiPizza" className="brand-logo" />
          </NavLink>
          <div className="nav-links">
            {user ? (
              <NavLink to="/cart" className="cart-btn">
                <BagIcon />
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </NavLink>
            ) : (
              <NavLink to="/login">Entrar</NavLink>
            )}
          </div>
        </nav>
        <main>
          <Outlet />
        </main>
      </div>

      {whatsapp && (
        <a
          className="whatsapp-fab"
          href={`https://wa.me/${whatsapp.replace("+", "")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Fale connosco no WhatsApp"
        >
          <span className="whatsapp-fab-label">Fale connosco</span>
          <span className="whatsapp-fab-icon">
            <img src="/logo.png" alt="" />
          </span>
        </a>
      )}
      <div className="bottom-nav">{navItems}</div>
    </div>
  );
}
