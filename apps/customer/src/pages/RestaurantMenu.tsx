import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import ProductModal, { type ProductForModal } from "../components/ProductModal";

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

  useEffect(() => {
    api.get(`/restaurants/${slug}`).then(({ data }) => {
      setRestaurant(data.restaurant);
      setActiveCategory(data.restaurant.categories[0]?.id ?? null);
    });
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const categoriesWithProducts = useMemo(
    () => restaurant?.categories.filter((c) => c.products.length > 0) ?? [],
    [restaurant],
  );

  if (!restaurant) return <p className="page">A carregar menu...</p>;

  function scrollToCategory(id: string) {
    setActiveCategory(id);
    document.getElementById(`category-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="page">
      <header
        className="restaurant-header"
        style={{ backgroundImage: `url(${restaurant.bannerUrl ?? FALLBACK_BANNER})` }}
      >
        <div className="restaurant-header-inner">
          <p className="eyebrow">{restaurant.isOpen === false ? "Fechado de momento" : "Aberto agora"}</p>
          <h1>{restaurant.name}</h1>
          {restaurant.description && <p className="description">{restaurant.description}</p>}
          <div className="restaurant-header-meta">
            <span>⭐ {restaurant.avgRating.toFixed(1)} ({restaurant.ratingCount})</span>
            {restaurant.acceptsDelivery && <span>🛵 Entrega</span>}
            {restaurant.acceptsPickup && <span>🏠 Recolha no local</span>}
          </div>
          <div className="hero-actions">
            <button className="btn-gold" onClick={() => categoriesWithProducts[0] && scrollToCategory(categoriesWithProducts[0].id)}>
              Ver o menu
            </button>
            <Link className="btn-outline-light" to="/orders">
              Os meus pedidos
            </Link>
          </div>
        </div>
      </header>

      {categoriesWithProducts.length > 1 && (
        <nav className="category-tabs">
          {categoriesWithProducts.map((cat) => (
            <button
              key={cat.id}
              className={`category-tab ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => scrollToCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      )}

      {categoriesWithProducts.map((cat) => (
        <section key={cat.id} id={`category-${cat.id}`} className="menu-category">
          <h2>{cat.name}</h2>
          <div className="product-grid">
            {cat.products.map((p) => (
              <button className="product-card" key={p.id} onClick={() => setActiveProduct(p)}>
                <div
                  className="product-card-image"
                  style={{ backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined }}
                >
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
      ))}

      {activeProduct && (
        <ProductModal
          restaurantSlug={slug!}
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onAdded={(msg) => setToast(msg)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
