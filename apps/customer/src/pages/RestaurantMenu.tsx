import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import ProductModal, { type ProductForModal } from "../components/ProductModal";
import { BikeIcon, CheckIcon, PinIcon, StarIcon } from "../components/NavIcons";

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
  categories: Category[];
}

const FALLBACK_BANNER =
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=1600&auto=format&fit=crop";

export default function RestaurantMenu() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductForModal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (!justAddedId) return;
    const t = setTimeout(() => setJustAddedId(null), 1800);
    return () => clearTimeout(t);
  }, [justAddedId]);

  useEffect(() => {
    api.get(`/restaurants/${slug}`).then(({ data }) => {
      setRestaurant(data.restaurant);
      setActiveCategory(data.restaurant.categories.find((c: Category) => c.products.length > 0)?.id ?? null);
    });
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Categories arrive already alphabetized from the API — this just drops
  // the empty ones (nothing to show yet) rather than re-sorting.
  const categoriesWithProducts = useMemo(
    () => restaurant?.categories.filter((c) => c.products.length > 0) ?? [],
    [restaurant],
  );
  const current = categoriesWithProducts.find((c) => c.id === activeCategory) ?? categoriesWithProducts[0];

  if (!restaurant) return <p className="page">A carregar menu...</p>;

  return (
    <div className="page">
      <header
        key={restaurant.id}
        className="restaurant-header"
        style={{ backgroundImage: `url(${restaurant.bannerUrl ?? FALLBACK_BANNER})` }}
      >
        <div className="restaurant-header-inner">
          <p className="eyebrow anim-fade-up" style={{ animationDelay: "0.05s" }}>
            {restaurant.isOpen === false ? "Fechado de momento" : "Aberto agora"}
          </p>
          <h1 className="anim-fade-up" style={{ animationDelay: "0.15s" }}>
            {restaurant.name}
          </h1>
          {restaurant.description && (
            <p className="description anim-fade-up" style={{ animationDelay: "0.25s" }}>
              {restaurant.description}
            </p>
          )}
          <div className="restaurant-header-meta anim-fade-up" style={{ animationDelay: "0.35s" }}>
            <span>
              <StarIcon /> {restaurant.avgRating.toFixed(1)} ({restaurant.ratingCount})
            </span>
            {restaurant.acceptsDelivery && (
              <span>
                <BikeIcon /> Entrega
              </span>
            )}
            {restaurant.acceptsPickup && (
              <span>
                <PinIcon /> Recolha no local
              </span>
            )}
          </div>
          <div className="hero-actions anim-fade-up" style={{ animationDelay: "0.45s" }}>
            <a className="btn-gold" href="#menu">
              Ver o menu
            </a>
            <Link className="btn-outline-light" to="/orders">
              Os meus pedidos
            </Link>
          </div>
        </div>
      </header>

      {categoriesWithProducts.length > 1 && (
        <nav className="category-tabs" id="menu">
          {categoriesWithProducts.map((cat) => (
            <button
              key={cat.id}
              className={`category-tab ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      )}

      {current && (
        <section key={current.id} className="menu-category anim-fade-up">
          <h2>{current.name}</h2>
          <div className="product-grid">
            {current.products.map((p) => (
              <button className="product-card" key={p.id} onClick={() => setActiveProduct(p)}>
                <div
                  className="product-card-image"
                  style={{ backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined }}
                >
                  {justAddedId === p.id && (
                    <span className="product-card-added">
                      <CheckIcon />
                    </span>
                  )}
                  <span className="product-card-add">+ Adicionar ao Pedido</span>
                </div>
                <div className="product-card-body">
                  <h3>{p.name}</h3>
                  <span className="price">{p.basePrice.toFixed(2)} €</span>
                </div>
                {p.description && <p className="product-card-desc">{p.description}</p>}
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="site-footer">
        <div className="site-footer-block">
          <h3>{restaurant.name}</h3>
          <p className="hint">{restaurant.address}</p>
          <a className="hint" href={`tel:${restaurant.phone}`}>
            {restaurant.phone}
          </a>
        </div>
        <div className="site-footer-block">
          <Link to="/privacidade">Política de privacidade</Link>
        </div>
      </footer>

      {activeProduct && (
        <ProductModal
          restaurantSlug={slug!}
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onAdded={(msg) => {
            setToast(msg);
            setJustAddedId(activeProduct.id);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
