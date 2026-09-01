import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProductModal, { type ProductForModal } from "../components/ProductModal";
import { BikeIcon, CheckIcon, PinIcon, PizzaIcon, StarIcon } from "../components/NavIcons";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { formatWeeklyHours, type StoreHour } from "../lib/storeHours";

interface Category {
  id: string;
  name: string;
  products: ProductForModal[];
}
interface RestaurantDetail {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  address: string;
  phone: string;
  avgRating: number;
  ratingCount: number;
  isOpen: boolean;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  hours: StoreHour[];
  categories: Category[];
}

interface RestaurantMenuProps {
  restaurantSlug?: string;
  embedded?: boolean;
}

const FALLBACK_BANNER =
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=86&w=1800&auto=format&fit=crop";

export default function RestaurantMenu({ restaurantSlug, embedded = false }: RestaurantMenuProps = {}) {
  const { slug: routeSlug } = useParams();
  const slug = restaurantSlug ?? routeSlug;
  const { items, subtotal } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductForModal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const suppressObserver = useRef(false);

  useEffect(() => {
    if (!justAddedId) return;
    const timer = setTimeout(() => setJustAddedId(null), 1800);
    return () => clearTimeout(timer);
  }, [justAddedId]);

  useEffect(() => {
    if (!slug) return;
    setLoadError(false);
    api
      .get(`/restaurants/${slug}`)
      .then(({ data }) => {
        setRestaurant(data.restaurant);
        setActiveCategory(data.restaurant.categories.find((category: Category) => category.products.length > 0)?.id ?? null);
      })
      .catch(() => setLoadError(true));
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const categoriesWithProducts = useMemo(
    () => restaurant?.categories.filter((category) => category.products.length > 0) ?? [],
    [restaurant],
  );

  useEffect(() => {
    if (categoriesWithProducts.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressObserver.current) return;
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveCategory(topMost.target.id);
      },
      { rootMargin: embedded ? "-90px 0px -55% 0px" : "-150px 0px -50% 0px", threshold: 0 },
    );
    categoriesWithProducts.forEach((category) => {
      const element = sectionRefs.current[category.id];
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [categoriesWithProducts, embedded]);

  if (!restaurant) {
    return (
      <div className={`menu-loading${loadError ? " is-error" : ""}${embedded ? " embedded" : ""}`} aria-live="polite">
        <img src="/apple-touch-icon.png" alt="" />
        <strong>{loadError ? "Não foi possível abrir o menu" : "A preparar o menu..."}</strong>
        {loadError && (
          <>
            <span>Confirma a ligação e tenta novamente.</span>
            <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
          </>
        )}
      </div>
    );
  }

  const weeklyHours = formatWeeklyHours(restaurant.hours ?? []);
  const today = new Date().getDay();
  const whatsapp = restaurant.phone?.replace(/\D/g, "") ?? "";

  return (
    <div className={`order-page editorial-order${embedded ? " order-page-embedded" : ""}`} id={embedded ? "menu-home" : undefined}>
      {!embedded && (
        <header className="order-hero">
          <div
            className="order-hero-bg"
            style={{ backgroundImage: `url(${restaurant.bannerUrl ?? FALLBACK_BANNER})` }}
          />
          <div className="order-hero-overlay" />
          <div className="order-hero-content">
            <div className="order-status-row">
              <span className={`order-status${restaurant.isOpen ? "" : " closed"}`}>
                <i /> {restaurant.isOpen ? "Aberto agora" : "Fechado agora"}
              </span>
              <span className="order-service-label">Delivery & Takeaway</span>
            </div>
            <h1>{restaurant.name}</h1>
            {restaurant.description && <p>{restaurant.description}</p>}
            <div className="order-meta-chips">
              {restaurant.ratingCount > 0 && (
                <span>
                  <StarIcon /> {restaurant.avgRating.toFixed(1)} <small>({restaurant.ratingCount})</small>
                </span>
              )}
              {restaurant.acceptsDelivery && <span><BikeIcon /> Delivery</span>}
              {restaurant.acceptsPickup && <span><PinIcon /> Takeaway</span>}
            </div>
          </div>
        </header>
      )}

      <div className="order-content" id={embedded ? "menu-home-content" : "menu"}>
        <div className="menu-heading-row editorial-menu-heading">
          <div>
            <span className="menu-kicker">Pediu? Vai.</span>
            <h2>{embedded ? "O Menu" : "Escolhe o que vai hoje"}</h2>
          </div>
          <div className="menu-heading-side">
            <p>Pizza bonita de ver. Pedido simples de fazer.</p>
            <div className="menu-service-inline" aria-label="Serviço da loja">
              <span className={restaurant.isOpen ? "is-open" : "is-closed"}>{restaurant.isOpen ? "Aberto agora" : "Fechado agora"}</span>
              {restaurant.acceptsDelivery && <span>Delivery</span>}
              {restaurant.acceptsPickup && <span>Takeaway</span>}
            </div>
          </div>
        </div>

        {categoriesWithProducts.length > 1 && (
          <nav className="category-tabs editorial-category-tabs" aria-label="Categorias do menu">
            {categoriesWithProducts.map((category) => (
              <button
                key={category.id}
                className={`category-tab ${activeCategory === category.id ? "active" : ""}`}
                onClick={() => {
                  setActiveCategory(category.id);
                  suppressObserver.current = true;
                  sectionRefs.current[category.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.setTimeout(() => {
                    suppressObserver.current = false;
                  }, 700);
                }}
              >
                {category.name}
              </button>
            ))}
          </nav>
        )}

        <div className={`menu-and-cart${cartCount > 0 ? " has-cart" : ""}`}>
          <div className="menu-catalog">
            {categoriesWithProducts.map((category) => (
              <section
                key={category.id}
                id={category.id}
                ref={(element) => {
                  sectionRefs.current[category.id] = element;
                }}
                className="menu-category"
              >
                <div className="menu-category-heading">
                  <h2>{category.name}</h2>
                  <span>{category.products.length} {category.products.length === 1 ? "opção" : "opções"}</span>
                </div>
                <div className="product-grid editorial-product-grid">
                  {category.products.map((product) => (
                    <button
                      className="product-card editorial-product-card"
                      key={product.id}
                      onClick={() => setActiveProduct(product)}
                      aria-label={`${product.name}, ${product.basePrice.toFixed(2)} euros`}
                    >
                      <div
                        className={`product-card-image${product.imageUrl ? "" : " no-image"}`}
                        style={{ backgroundImage: product.imageUrl ? `url(${product.imageUrl})` : undefined }}
                      >
                        {!product.imageUrl && <PizzaIcon />}
                        {justAddedId === product.id && (
                          <span className="product-card-added" aria-label="Adicionado"><CheckIcon /></span>
                        )}
                        <span className="product-card-action" aria-hidden="true">+</span>
                      </div>
                      <div className="product-card-copy">
                        <div className="product-card-title-row">
                          <h3>{product.name}</h3>
                          <span className="price">{product.basePrice.toFixed(2)} €</span>
                        </div>
                        {product.description && <p>{product.description}</p>}
                        <span className="product-card-choose">Ver e personalizar <b aria-hidden="true">↗</b></span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {cartCount > 0 && (
            <aside className="desktop-order-cart" aria-label="Resumo do pedido">
              <span className="desktop-cart-kicker">Encomenda atual</span>
              <h3>O teu pedido</h3>
              <div className="desktop-cart-items">
                {items.slice(0, 4).map((item) => (
                  <div className="desktop-cart-item" key={item.id}>
                    <span>{item.quantity}×</span>
                    <div><strong>{item.productName}</strong>{item.secondaryProductName && <small> / {item.secondaryProductName}</small>}</div>
                    <b>{item.lineTotal.toFixed(2)} €</b>
                  </div>
                ))}
                {items.length > 4 && <small className="desktop-cart-more">+ {items.length - 4} itens no carrinho</small>}
              </div>
              <div className="desktop-cart-total"><span>Total</span><strong>{subtotal.toFixed(2)} €</strong></div>
              <Link to="/cart">Ver pedido <span>→</span></Link>
            </aside>
          )}
        </div>

        <section className="store-trust-section" aria-label="Informações da VAIPIZZA">
          <div className="store-contact-card">
            <span className="store-info-kicker">Fale connosco</span>
            <h2>Precisa de ajuda com o pedido?</h2>
            <p>{restaurant.address}</p>
            <div className="store-contact-actions">
              <a href={`tel:${restaurant.phone}`}>Ligar · {restaurant.phone}</a>
              {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}
            </div>
          </div>

          <div className="store-hours-card">
            <span className="store-info-kicker">Horário</span>
            <h2>Quando estamos por cá</h2>
            <div className="store-hours-list">
              {weeklyHours.map((row) => (
                <div key={row.dayOfWeek} className={`${row.dayOfWeek === today ? "today " : ""}${row.isClosed ? "closed" : ""}`}>
                  <span>{row.day}{row.dayOfWeek === today && <small>Hoje</small>}</span>
                  <strong>{row.label}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="site-footer order-footer editorial-footer">
          <div className="site-footer-block">
            <img className="order-footer-logo" src="/apple-touch-icon.png" alt="" />
            <div><h3>{restaurant.name}</h3><p className="hint">Delivery & Takeaway</p></div>
          </div>
          <div className="site-footer-block"><Link to="/privacidade">Política de privacidade</Link></div>
        </footer>
      </div>

      {cartCount > 0 && (
        <Link className="menu-cart-bar" to="/cart" aria-label={`Abrir carrinho com ${cartCount} itens`}>
          <span className="menu-cart-count">{cartCount}</span>
          <span>Ver pedido</span>
          <strong>{subtotal.toFixed(2)} €</strong>
        </Link>
      )}

      {activeProduct && slug && (
        <ProductModal
          restaurantSlug={slug}
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onAdded={(message) => {
            setToast(message);
            setJustAddedId(activeProduct.id);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
