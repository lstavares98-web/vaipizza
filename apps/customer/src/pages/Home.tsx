import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";

// Only one restaurant runs on the platform for now, so there's no reason
// to make the customer pick one — the home route drops them straight
// into its menu. Leftover demo restaurants from earlier test seeding
// (e.g. "Burger House") can still exist in the database, so this targets
// VaiPizza's own slug explicitly rather than "whichever restaurant sorts
// first". Once a second real restaurant is added, this is the one place
// that needs to grow a real picker again.
const PRIMARY_RESTAURANT_SLUG = "vaipizza";

export default function Home() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api.get("/restaurants").then(({ data }) => {
      const restaurants = data.restaurants as { slug: string }[];
      const primary = restaurants.find((r) => r.slug === PRIMARY_RESTAURANT_SLUG);
      setSlug(primary?.slug ?? restaurants[0]?.slug ?? null);
    });
  }, []);

  if (slug === undefined) return <p className="page">A carregar...</p>;
  if (slug === null) return <p className="page">Ainda não há nenhum restaurante disponível.</p>;
  return <Navigate to={`/restaurants/${slug}`} replace />;
}
