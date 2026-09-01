import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BikeIcon, PinIcon } from "../components/NavIcons";
import FranchiseModal from "../components/FranchiseModal";
import { resolvePrimaryRestaurant, VAIPIZZA } from "../config/vaipizza";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
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
  const isOpen = restaurant?.isOpen ?? false;

  return (
    <div className="cinema-home">
      <section className="cinema-hero" aria-label="VAIPIZZA">
        <div className="cinema-hero-media" style={{ backgroundImage: `url(${heroImage})` }} />
        <div className="cinema-hero-grain" aria-hidden="true" />
        <div className="cinema-hero-glow" aria-hidden="true" />

        <nav className="cinema-nav" aria-label="Navegação principal">
          <Link className="cinema-brand" to="/" aria-label="VAIPIZZA — início">
            <img src={VAIPIZZA.logoPath} alt="VAIPIZZA" />
            <span>
              <strong>{VAIPIZZA.name}</strong>
              <small>{VAIPIZZA.tagline}</small>
            </span>
          </Link>
          <div className="cinema-nav-actions">
            <Link className="cinema-nav-link" to={user ? "/orders" : "/login"}>
              {user ? "Pedidos" : "Entrar"}
            </Link>
            <a className="cinema-order-pill" href="#menu-home">
              Pedir agora
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </nav>

        <div className="cinema-hero-content">
          <div className="cinema-kicker">
            <span className={`cinema-live-dot${isOpen ? "" : " is-closed"}`} />
            {loading ? "A ligar à loja" : loadError ? "Menu temporariamente indisponível" : isOpen ? "Aberto para pedidos" : "Fechado neste momento"}
          </div>

          <p className="cinema-service">{VAIPIZZA.serviceLabel}</p>
          <h1>
            A tua pizza.
            <span>Sem esperar pela vontade.</span>
          </h1>
          <p className="cinema-lead">
            Escolhe, personaliza e acompanha o teu pedido numa experiência feita para ser tão simples quanto abrir a caixa.
          </p>

          <div className="cinema-hero-actions">
            <a className="cinema-primary-cta" href="#menu-home">
              <span>Ver o menu</span>
              <strong aria-hidden="true">↓</strong>
            </a>
            <a className="cinema-secondary-cta" href="#experiencia">
              Conhecer a VAIPIZZA
            </a>
          </div>

          <div className="cinema-service-row" aria-label="Serviços disponíveis">
            {restaurant?.acceptsDelivery !== false && (
              <span>
                <BikeIcon /> Delivery
              </span>
            )}
            {restaurant?.acceptsPickup !== false && (
              <span>
                <PinIcon /> Takeaway
              </span>
            )}
            {restaurant?.todayHours && <span className="cinema-hours">Hoje · {restaurant.todayHours}</span>}
          </div>
        </div>

        <div className="cinema-mark" aria-hidden="true">
          <span className="cinema-ring cinema-ring-one" />
          <span className="cinema-ring cinema-ring-two" />
          <img src={VAIPIZZA.logoPath} alt="" />
        </div>

        <a className="cinema-scroll-cue" href="#menu-home" aria-label="Descer para ver o menu">
          <span>Ver menu</span>
          <i />
        </a>
      </section>

      <RestaurantMenu restaurantSlug={VAIPIZZA.slug} embedded />

      <section className="cinema-experience" id="experiencia">
        <div className="cinema-section-heading">
          <p>VAIPIZZA · {VAIPIZZA.tagline}</p>
          <h2>O espetáculo fica na pizza. O pedido fica simples.</h2>
        </div>

        <div className="cinema-feature-grid">
          <article>
            <span>01</span>
            <h3>Escolhe sem ruído</h3>
            <p>Menu direto, categorias claras e cada pizza com tudo o que precisas para decidir rapidamente.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Faz à tua maneira</h3>
            <p>Tamanho, massa, extras, ingredientes a retirar e observações num único fluxo.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Segue o pedido</h3>
            <p>Da confirmação à preparação e entrega, os estados aparecem de forma simples e compreensível.</p>
          </article>
        </div>
      </section>

      <section className="cinema-order-section">
        <div className="cinema-order-visual">
          <div className="cinema-order-orbit" aria-hidden="true" />
          <img src={VAIPIZZA.logoPath} alt="Logótipo VAIPIZZA" />
        </div>
        <div className="cinema-order-copy">
          <p className="cinema-service">Está decidido?</p>
          <h2>Então vai.</h2>
          <p>
            {restaurant?.address
              ? `Delivery e takeaway a partir de ${restaurant.address}.`
              : "Delivery e takeaway numa experiência pensada primeiro para o telemóvel."}
          </p>
          <Link className="cinema-primary-cta cinema-primary-cta-dark" to={VAIPIZZA.orderPath}>
            <span>Abrir o menu</span>
            <strong aria-hidden="true">→</strong>
          </Link>
        </div>
      </section>

      <section className="cinema-franchise-cta">
        <div><span>Expansão VAIPIZZA</span><h2>Quer levar a VAIPIZZA para a sua cidade?</h2></div>
        <button type="button" onClick={() => setFranchiseOpen(true)}>Seja um franqueado <b aria-hidden="true">→</b></button>
      </section>

      <footer className="cinema-footer">
        <div>
          <img src={VAIPIZZA.logoPath} alt="" />
          <span>{VAIPIZZA.name}</span>
        </div>
        <p>{VAIPIZZA.serviceLabel} · {VAIPIZZA.tagline}</p>
        <div className="cinema-footer-links"><button type="button" onClick={() => setFranchiseOpen(true)}>Seja um franqueado</button><Link to="/privacidade">Privacidade</Link></div>
      </footer>
      {franchiseOpen && <FranchiseModal onClose={() => setFranchiseOpen(false)} />}
    </div>
  );
}
