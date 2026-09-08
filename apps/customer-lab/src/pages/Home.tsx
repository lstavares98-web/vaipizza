import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BikeIcon, PinIcon } from "../components/NavIcons";
import FranchiseModal from "../components/FranchiseModal";
import { resolvePrimaryRestaurant, VAIPIZZA } from "../config/vaipizza";
import { useAuth } from "../context/AuthContext";
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

const FALLBACK_HERO =
  "https://images.unsplash.com/photo-1579751626657-72bc17010498?q=86&w=2200&auto=format&fit=crop";

export default function Home() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<HomeRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [franchiseOpen, setFranchiseOpen] = useState(false);

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

  const heroImage = restaurant?.bannerUrl ?? FALLBACK_HERO;
  const statusLabel = loading
    ? "A ligar à loja"
    : loadError
      ? "Menu temporariamente indisponível"
      : restaurant?.isOpen
        ? "Aberto para pedidos"
        : "Fechado neste momento";

  return (
    <div className="lab-home">
      <header className="lab-topbar">
        <Link className="lab-brand" to="/" aria-label="VAIPIZZA — início">
          <img src={VAIPIZZA.logoPath} alt="" />
          <span>
            <strong>{VAIPIZZA.name}</strong>
            <small>{VAIPIZZA.tagline}</small>
          </span>
        </Link>

        <nav className="lab-nav" aria-label="Navegação principal">
          <a href="#ofertas">Ofertas</a>
          <a href="#menu-home">Menu</a>
          <Link to={user ? "/orders" : "/login"}>{user ? "Pedidos" : "Entrar"}</Link>
          <a className="lab-nav-order" href="#menu-home">Pedir agora</a>
        </nav>
      </header>

      <main>
        <section className="lab-hero">
          <div className="lab-hero-copy">
            <div className="lab-status-pill">
              <span className={`lab-status-dot${restaurant?.isOpen ? " is-open" : ""}`} />
              {statusLabel}
            </div>

            <p className="lab-eyebrow">DELIVERY · TAKEAWAY · PIZZA DO TEU JEITO</p>
            <h1>Pizza que dá vontade.<br /><span>Pedido que vai.</span></h1>
            <p className="lab-hero-lead">
              Escolhe a tua favorita, personaliza sem complicação e recebe onde quiseres — ou passa por cá e leva contigo.
            </p>

            <div className="lab-hero-actions">
              <a className="lab-btn lab-btn-primary" href="#menu-home">Pedir agora <span>→</span></a>
              <a className="lab-btn lab-btn-secondary" href="#ofertas">Ver ofertas</a>
            </div>

            <div className="lab-hero-meta">
              {restaurant?.todayHours && <span><strong>Hoje</strong>{restaurant.todayHours}</span>}
              {restaurant?.address && <span><strong>Loja</strong>{restaurant.address}</span>}
            </div>
          </div>

          <div className="lab-hero-visual" aria-label="Pizza em destaque">
            <div className="lab-burst lab-burst-one" aria-hidden="true">PIZZA!</div>
            <div className="lab-burst lab-burst-two" aria-hidden="true">VAI!</div>
            <div className="lab-pizza-frame">
              <img src={heroImage} alt="Pizza VAIPIZZA em destaque" />
            </div>
            <div className="lab-price-sticker" aria-hidden="true">
              <small>HOJE VAI DE</small>
              <strong>PIZZA</strong>
            </div>
          </div>
        </section>

        <section className="lab-service-section" aria-label="Como quer receber">
          <div className="lab-section-intro">
            <p>COMO QUER RECEBER?</p>
            <h2>Tu escolhes o plano.<br />A pizza faz o resto.</h2>
          </div>

          <div className="lab-service-grid">
            <a className={`lab-service-card lab-delivery${restaurant?.acceptsDelivery === false ? " is-disabled" : ""}`} href="#menu-home">
              <span className="lab-service-icon"><BikeIcon /></span>
              <div>
                <small>SEM SAIR DE CASA</small>
                <h3>Entrega</h3>
                <p>{restaurant?.acceptsDelivery === false ? "Indisponível nesta loja" : "Escolhe, pede e nós tratamos do caminho."}</p>
              </div>
              <b aria-hidden="true">→</b>
            </a>

            <a className={`lab-service-card lab-pickup${restaurant?.acceptsPickup === false ? " is-disabled" : ""}`} href="#menu-home">
              <span className="lab-service-icon"><PinIcon /></span>
              <div>
                <small>PASSA E LEVA</small>
                <h3>Recolha</h3>
                <p>{restaurant?.acceptsPickup === false ? "Indisponível nesta loja" : "Faz o pedido antes e vem buscar sem complicação."}</p>
              </div>
              <b aria-hidden="true">→</b>
            </a>
          </div>
        </section>

        <section className="lab-offers" id="ofertas" aria-label="Ofertas VaiPizza">
          <div className="lab-offers-heading">
            <div>
              <p>OFERTAS VAIPIZZA</p>
              <h2>Para hoje ir<br />direto ao ponto.</h2>
            </div>
            <a href="#menu-home">Ver menu completo <span>↘</span></a>
          </div>

          <div className="lab-offer-grid">
            <a className="lab-offer-card lab-offer-red" href="#menu-home">
              <span className="lab-offer-number">01</span>
              <small>PARA PARTILHAR</small>
              <h3>Pizza grande,<br />fome pequena.</h3>
              <p>Escolhe o tamanho e monta à tua maneira.</p>
              <b>Escolher pizza →</b>
            </a>

            <a className="lab-offer-card lab-offer-yellow" href="#menu-home">
              <span className="lab-offer-number">02</span>
              <small>SEM COMPLICAÇÃO</small>
              <h3>Combo que<br />resolve o jantar.</h3>
              <p>Pizza, extras e bebida num pedido só.</p>
              <b>Ver combos →</b>
            </a>

            <a className="lab-offer-card lab-offer-cream" href="#menu-home">
              <span className="lab-offer-number">03</span>
              <small>DO TEU JEITO</small>
              <h3>Mais queijo?<br />Claro que sim.</h3>
              <p>Tamanho, massa, extras e ingredientes como preferires.</p>
              <b>Personalizar →</b>
            </a>
          </div>
        </section>

        <section className="lab-menu-bridge">
          <div>
            <p>AGORA ESCOLHE A TUA</p>
            <h2>O menu está servido.</h2>
          </div>
          <span>↓</span>
        </section>

        <div className="lab-menu-shell">
          <RestaurantMenu restaurantSlug={VAIPIZZA.slug} embedded />
        </div>

        <section className="lab-confidence">
          <article>
            <span>01</span>
            <h3>Escolhe</h3>
            <p>Encontra a pizza, combo ou acompanhamento que te apetece.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Personaliza</h3>
            <p>Tamanho, massa, extras e ingredientes ficam nas tuas mãos.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Recebe</h3>
            <p>Acompanha o pedido até chegar — ou até estar pronto para recolha.</p>
          </article>
        </section>

        <section className="lab-final-cta">
          <div>
            <p>JÁ ESTÁ A DAR FOME?</p>
            <h2>Então vai de VAIPIZZA.</h2>
          </div>
          <a className="lab-btn lab-btn-light" href="#menu-home">Abrir o menu <span>↑</span></a>
        </section>

        <section className="lab-franchise">
          <span>EXPANSÃO VAIPIZZA</span>
          <h2>Quer levar a VAIPIZZA para a sua cidade?</h2>
          <button type="button" onClick={() => setFranchiseOpen(true)}>Seja um franqueado →</button>
        </section>
      </main>

      <footer className="lab-footer">
        <Link className="lab-footer-brand" to="/">
          <img src={VAIPIZZA.logoPath} alt="" />
          <strong>{VAIPIZZA.name}</strong>
        </Link>
        <span>{VAIPIZZA.serviceLabel} · {VAIPIZZA.tagline}</span>
        <div>
          <button type="button" onClick={() => setFranchiseOpen(true)}>Franquia</button>
          <Link to="/privacidade">Privacidade</Link>
        </div>
      </footer>

      {franchiseOpen && <FranchiseModal onClose={() => setFranchiseOpen(false)} />}
    </div>
  );
}
