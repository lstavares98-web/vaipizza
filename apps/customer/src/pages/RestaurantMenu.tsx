import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  categories: Category[];
}

export default function RestaurantMenu() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductForModal | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/restaurants/${slug}`).then(({ data }) => setRestaurant(data.restaurant));
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!restaurant) return <p className="page">A carregar menu...</p>;

  return (
    <div className="page">
      <header className="restaurant-header" style={{ backgroundImage: restaurant.bannerUrl ? `url(${restaurant.bannerUrl})` : undefined }}>
        <h1>{restaurant.name}</h1>
        <p>{restaurant.description}</p>
        <p>
          ⭐ {restaurant.avgRating.toFixed(1)} ({restaurant.ratingCount}){" "}
          {restaurant.acceptsDelivery && "· Entrega"} {restaurant.acceptsPickup && "· Recolha no local"}
        </p>
      </header>

      {restaurant.categories.map((cat) => (
        <section key={cat.id} className="menu-category">
          <h2>{cat.name}</h2>
          <div className="product-grid">
            {cat.products.map((p) => (
              <button className="product-card" key={p.id} onClick={() => setActiveProduct(p)}>
                {p.imageUrl && <div className="product-card-image" style={{ backgroundImage: `url(${p.imageUrl})` }} />}
                <div className="product-card-body">
                  <h3>{p.name}</h3>
                  {p.description && <p className="muted">{p.description}</p>}
                  <p className="price">{p.basePrice.toFixed(2)} €</p>
                </div>
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
