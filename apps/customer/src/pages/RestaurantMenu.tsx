import { useEffect, useMemo, useRef, useState } from "react";
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

  // Scrollspy: the tab bar sticks under the top nav, and whichever category
  // section currently occupies that band becomes the active tab — no need
  // to tap a tab to browse, scrolling alone keeps it in sync.
  const suppressSpyUntil = useRef(0);
  useEffect(() => {
    if (categoriesWithProducts.length === 0) return;
    // Each IntersectionObserver callback only reports targets whose state
    // just changed, not the full current picture — so a fast scroll that
    // skips a section's threshold crossing can leave stale entries out of
    // the batch entirely. Track membership ourselves instead of trusting
    // each batch to be a complete snapshot.
    const intersecting = new Map<string, number>();
    const SPY_LINE = 112;

    function evaluate() {
      if (Date.now() < suppressSpyUntil.current) return;
      const firstCategory = categoriesWithProducts[0];
      const lastCategory = categoriesWithProducts[categoriesWithProducts.length - 1];
      // Above the first category (still in the hero) or below the last
      // one (page can't scroll further) — these idle endpoints don't
      // necessarily coincide with an intersection threshold crossing, so
      // they're checked on every scroll tick rather than only inside the
      // observer callback.
      if (window.scrollY <= 4 && firstCategory) {
        setActiveCategory(firstCategory.id);
        return;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && lastCategory) {
        setActiveCategory(lastCategory.id);
        return;
      }
      if (intersecting.size === 0) return;
      // Otherwise, the active section is the one whose top edge most
      // recently scrolled past the reference line (just under the sticky
      // tab bar) — not simply "whichever top value is smallest", which
      // would keep crediting a section that's almost entirely scrolled
      // away with only its trailing edge still poking in.
      const all = [...intersecting.entries()];
      const passed = all.filter(([, top]) => top <= SPY_LINE);
      const [id] = passed.length > 0
        ? passed.reduce((a, b) => (a[1] > b[1] ? a : b))
        : all.reduce((a, b) => (a[1] < b[1] ? a : b));
      setActiveCategory(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("category-", "");
          if (entry.isIntersecting) intersecting.set(id, entry.boundingClientRect.top);
          else intersecting.delete(id);
        }
        evaluate();
      },
      { rootMargin: `-${SPY_LINE}px 0px -60% 0px`, threshold: 0 },
    );
    for (const cat of categoriesWithProducts) {
      const el = document.getElementById(`category-${cat.id}`);
      if (el) observer.observe(el);
    }

    // Catches the top/bottom idle endpoints on ticks where nothing
    // crossed an intersection threshold (e.g. easing to a stop exactly at
    // scrollY 0 after the last section already exited the spy band).
    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(evaluate);
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [categoriesWithProducts]);

  useEffect(() => {
    if (!activeCategory) return;
    document
      .querySelector(`[data-category-tab="${activeCategory}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeCategory]);

  if (!restaurant) return <p className="page">A carregar menu...</p>;

  function scrollToCategory(id: string) {
    setActiveCategory(id);
    // A tap should win outright, even while the smooth-scroll it triggers
    // passes through other sections' intersection bands on the way there.
    suppressSpyUntil.current = Date.now() + 700;
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
              data-category-tab={cat.id}
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
