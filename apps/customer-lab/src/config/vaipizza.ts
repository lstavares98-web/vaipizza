export const VAIPIZZA = {
  name: "VAIPIZZA",
  slug: "vaipizza",
  tagline: "Pediu? Vai.",
  serviceLabel: "Delivery & Takeaway",
  orderPath: "/pedir",
  logoPath: "/apple-touch-icon.png",
} as const;

export function resolvePrimaryRestaurant<T extends { slug: string }>(restaurants: T[]): T | null {
  return restaurants.find((restaurant) => restaurant.slug === VAIPIZZA.slug) ?? restaurants[0] ?? null;
}
