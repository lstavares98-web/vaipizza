export interface DispatchRestaurantPoint {
  lat: number;
  lng: number;
}

export interface DispatchCourierCandidate {
  id: string;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: Date | null;
  recentOfferCount: number;
  lastOfferedAt: Date | null;
}

export interface RankedCourierCandidate extends DispatchCourierCandidate {
  distanceKm: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isFreshCourierLocation(
  locationUpdatedAt: Date | null,
  now = new Date(),
  maxAgeSeconds = 120,
): boolean {
  if (!locationUpdatedAt) return false;
  const ageMs = now.getTime() - locationUpdatedAt.getTime();
  return ageMs >= 0 && ageMs <= maxAgeSeconds * 1000;
}

/**
 * Pick the closest courier without turning "closest" into "always the same
 * person". A clearly closer courier still wins. When two or more couriers are
 * practically equivalent (within 750 m or 25% of the best distance), recent
 * offer load becomes the first tie-breaker.
 */
export function chooseCourierCandidate(
  restaurant: DispatchRestaurantPoint,
  candidates: DispatchCourierCandidate[],
  now = new Date(),
  maxLocationAgeSeconds = 120,
): RankedCourierCandidate | null {
  const ranked = candidates
    .filter(
      (candidate) =>
        candidate.lat !== null &&
        candidate.lng !== null &&
        isFreshCourierLocation(candidate.locationUpdatedAt, now, maxLocationAgeSeconds),
    )
    .map((candidate) => ({
      ...candidate,
      distanceKm: haversineKm(restaurant.lat, restaurant.lng, candidate.lat!, candidate.lng!),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (ranked.length === 0) return null;

  const nearestDistance = ranked[0]!.distanceKm;
  const equivalentDistanceLimit = Math.max(nearestDistance + 0.75, nearestDistance * 1.25);
  const equivalentPool = ranked.filter((candidate) => candidate.distanceKm <= equivalentDistanceLimit);

  equivalentPool.sort((a, b) => {
    if (a.recentOfferCount !== b.recentOfferCount) return a.recentOfferCount - b.recentOfferCount;

    const aLast = a.lastOfferedAt?.getTime() ?? 0;
    const bLast = b.lastOfferedAt?.getTime() ?? 0;
    if (aLast !== bLast) return aLast - bLast;

    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.id.localeCompare(b.id);
  });

  return equivalentPool[0] ?? ranked[0]!;
}


export function shouldEscalateDispatch(failedOfferCount: number, maxRetries: number): boolean {
  return failedOfferCount >= maxRetries;
}
