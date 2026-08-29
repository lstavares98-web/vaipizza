const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DeliveryFeeRestaurant {
  deliveryFeeMode: "TIERED" | "BASE_PLUS_PER_KM";
  deliveryFeeBase: number;
  deliveryFeePerKm: number;
  deliveryFeeFreeKm: number;
  deliveryFeeTiers?: { upToKm: number; fee: number }[];
}

/** Generalizes the legacy Yummix's base+per-km calc to also support fixed brackets. */
export function calcDeliveryFee(restaurant: DeliveryFeeRestaurant, distanceKm: number): number {
  if (restaurant.deliveryFeeMode === "TIERED") {
    const tiers = [...(restaurant.deliveryFeeTiers ?? [])].sort((a, b) => a.upToKm - b.upToKm);
    const match = tiers.find((tier) => distanceKm <= tier.upToKm);
    return match ? match.fee : (tiers.at(-1)?.fee ?? 0);
  }
  const extraKm = Math.max(0, distanceKm - restaurant.deliveryFeeFreeKm);
  return Math.round((restaurant.deliveryFeeBase + extraKm * restaurant.deliveryFeePerKm) * 100) / 100;
}
