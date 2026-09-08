import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BikeIcon, PinIcon } from "../components/NavIcons";
import FranchiseModal from "../components/FranchiseModal";
import { resolvePrimaryRestaurant, VAIPIZZA } from "../config/vaipizza";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import "../lab-home.css";
import RestaurantMenu from "./RestaurantMenu";

interface HomeRestaurant {
  slug: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  address: string | null;
  todayHours: string | null;
  isOpen: boolean;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
}

const FALLBACK_PIZZA_IMAGES = [
  "https://images.unsplash.com/photo-1579751626657-72bc17010498?q=86&w=2200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=86&w=2200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=86&w=2200&auto=format&fit=crop",
] as const;

const HERO_COPY = {
  eyebrow: "DELIVERY & TAKEAWAY",
  title: "HOJE VAI DE PIZZA",
  lines: ["HOJE VAI", "DE PIZZA"],
  detail: "Escolhe a tua favorita, personaliza e faz o pedido em poucos passos.",
} as const;

export default function Home() {
  const { user } = useAuth();
  const { items, subtotal } = useCart();
  const [restaurant, setRestaurant] = useState<HomeRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [franchiseOpen, setFranchiseOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    api
      .get("/restaurants")
      .then(({ data }) => {
        setRestaurant(resolvePrimaryRestaurant(data.restaurants as HomeRestaurant[]));
        setLoadError(false);
      })
      .catch(() => {
        setRestaurant(null);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const pizzaImages = restaurant?.bannerUrl
    ? [restaurant.bannerUrl, FALLBACK_PIZZA_IMAGES[1], FALLBACK_PIZZA_IMAGES[2]]
    : [...FALLBACK_PIZZA_IMAGES];
  const currentPizzaImage = pizzaImages[imageIndex] ?? pizzaImages[0] ?? FALLBACK_PIZZA_IMAGES[0];
  const nextPizzaImage = pizzaImages[(imageIndex + 1) % pizzaImages.length] ?? currentPizzaImage;
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const statusLabel = loading
    ? "A ligar à loja"
    : loadError
      ? "Menu temporariamente indisponível"
      : restaurant?.isOpen
        ? "Aberto para pedidos"
        : "Fechado neste momento";

  const previousPizza = () => setImageIndex((index) => (index - 1 + pizzaImages.length) % pizzaImages.length);
  const nextPizza = () => setImageIndex((index) => (index + 1) % pizzaImages.length);

  return (
    <div className="lab-home matteo-lab">
      <section className="matteo-hero" aria-label="Promoções em destaque">
        <header className="matteo-nav-shell">
          <a className="matteo-order-contact" href="#menu-home">
            <span className="matteo-phone-icon" aria-hidden="true">↗</span>
            <span>
              <small>PEDIR AGORA</small>
              <strong>{VAIPIZZA.serviceLabel}</strong>
            </span>
          </a>

          <nav className="matteo-nav" aria-label="Navegação principal">
            <a href="#inicio">Home</a>
            <a href="#menu-home">Produtos</a>
            <a href="#menu-home">Menu</a>
            <Link className="matteo-brand" to="/" aria-label="VAIPIZZA — início">
              <img src={VAIPIZZA.logoPath} alt="" />
              <strong>{VAIPIZZA.name}</strong>
            </Link>
            <a href="#como-receber">Delivery</a>
            <Link to={user ? "/orders" : "/login"}>{user ? "Pedidos" : "Entrar"}</Link>
          </nav>

          <Link className="matteo-cart" to="/cart" aria-label={`Carrinho com ${cartCount} itens`}>
            <span aria-hidden="true">🛒</span>
            {cartCount > 0 && <b>{cartCount}</b>}
          </Link>
        </header>

        <div className="matteo-slide" id="inicio">
          <button className="matteo-arrow matteo-arrow-left" type="button" onClick={previousPizza} aria-label="Pizza anterior">
            ‹
          </button>

          <div className="matteo-pizza-stage" aria-label="Pizzas em destaque">
            <div className="matteo-board" aria-hidden="true" />
            <div className="matteo-pizza matteo-pizza-back">
              <img src={nextPizzaImage} alt="Pizza VAIPIZZA em segundo plano" />
            </div>
            <div className="matteo-pizza matteo-pizza-front">
              <img src={currentPizzaImage} alt="Pizza VAIPIZZA em destaque" />
            </div>
            <span className="matteo-splash matteo-splash-one" aria-hidden="true">PIZZA!</span>
            <span className="matteo-splash matteo-splash-two" aria-hidden="true">VAIPIZZA</span>
          </div>

          <div className="matteo-copy">
            <div className="matteo-status">
              <span className={`matteo-status-dot${restaurant?.isOpen ? " is-open" : ""}`} />
              {statusLabel}
            </div>
            <p className="matteo-eyebrow">{HERO_COPY.eyebrow}</p>
            <h1 aria-label={HERO_COPY.title}>
              <span>{HERO_COPY.lines[0]}</span>
              <span>{HERO_COPY.lines[1]}</span>
            </h1>
            <p className="matteo-detail">{HERO_COPY.detail}</p>
            <div className="matteo-actions">
              <a className="matteo-primary" href="#menu-home">Pedir agora</a>
              <a className="matteo-secondary" href="#como-receber">Como funciona</a>
            </div>
            <div className="matteo-meta">
              {restaurant?.todayHours && <span><small>HOJE</small>{restaurant.todayHours}</span>}
              {cartCount > 0 && <span><small>NO CARRINHO</small>{cartCount} itens · {subtotal.toFixed(2)} €</span>}
            </div>
          </div>

          <button className="matteo-arrow matteo-arrow-right" type="button" onClick={nextPizza} aria-label="Próxima pizza">
            ›
          </button>

          <div className="matteo-dots" aria-label="Selecionar pizza">
            {pizzaImages.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className={index === imageIndex ? "active" : ""}
                aria-label={`Mostrar pizza ${index + 1}`}
                onClick={() => setImageIndex(index)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="matteo-service-strip" id="como-receber" aria-label="Como quer receber">
        <div className="matteo-service-title">
          <small>ESCOLHE O TEU JEITO</small>
          <h2>Como quer receber?</h2>
        </div>

        <a className={`matteo-service-option${restaurant?.acceptsDelivery === false ? " is-disabled" : ""}`} href="#menu-home">
          <span><BikeIcon /></span>
          <div><strong>Entrega</strong><small>{restaurant?.acceptsDelivery === false ? "Indisponível" : "Levamos até si"}</small></div>
          <b>→</b>
        </a>

        <a className={`matteo-service-option${restaurant?.acceptsPickup === false ? " is-disabled" : ""}`} href="#menu-home">
          <span><PinIcon /></span>
          <div><strong>Recolha</strong><small>{restaurant?.acceptsPickup === false ? "Indisponível" : "Pede e passa para buscar"}</small></div>
          <b>→</b>
        </a>
      </section>

      <section className="matteo-menu-intro">
        <p>ESCOLHE. PERSONALIZA. PEDE.</p>
        <h2>Agora é só escolher a pizza.</h2>
        <a href="#menu-home">Ver menu ↓</a>
      </section>

      <div className="matteo-menu-shell">
        <RestaurantMenu restaurantSlug={VAIPIZZA.slug} embedded />
      </div>

      <section className="matteo-bottom-promo">
        <div>
          <small>VAIPIZZA</small>
          <h2>Pediu? Vai.</h2>
          <p>Do clique à entrega, sem complicação.</p>
        </div>
        <a href="#menu-home">Abrir o menu →</a>
      </section>

      <section className="matteo-franchise">
        <div>
          <small>EXPANSÃO VAIPIZZA</small>
          <h2>Quer levar a VAIPIZZA para a sua cidade?</h2>
        </div>
        <button type="button" onClick={() => setFranchiseOpen(true)}>Seja um franqueado →</button>
      </section>

      <footer className="matteo-footer">
        <Link to="/" className="matteo-footer-brand"><img src={VAIPIZZA.logoPath} alt="" /><strong>{VAIPIZZA.name}</strong></Link>
        <span>{VAIPIZZA.serviceLabel} · {VAIPIZZA.tagline}</span>
        <Link to="/privacidade">Privacidade</Link>
      </footer>

      {franchiseOpen && <FranchiseModal onClose={() => setFranchiseOpen(false)} />}
    </div>
  );
}
