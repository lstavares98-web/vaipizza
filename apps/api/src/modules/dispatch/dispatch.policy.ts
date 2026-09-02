export interface DispatchRestaurantPoint {
  lat: number;
  lng: number;
  /** Maximum restaurant-to-courier distance for automatic/manual dispatch. */
  courierDispatchRadiusKm?: number;
}

export interface DispatchCourierCandidate {
  id: string;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: Date | null;
  locationAccuracyM: number | null;
  recentOfferCount: number;
  lastOfferedAt: Date | null;
}

export type CourierGeoEligibilityReason =
  | "NO_LOCATION"
  | "STALE_LOCATION"
  | "LOW_ACCURACY"
  | "OUTSIDE_DISPATCH_ZONE";

export interface CourierGeoEligibility {
  eligible: boolean;
  reasons: CourierGeoEligibilityReason[];
  distanceKm: number | null;
  gpsFresh: boolean;
  gpsAccurate: boolean;
  inDispatchZone: boolean;
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

export function isAccurateCourierLocation(locationAccuracyM: number | null, maxAccuracyMeters = 100): boolean {
  return locationAccuracyM !== null && Number.isFinite(locationAccuracyM) && locationAccuracyM >= 0 && locationAccuracyM <= maxAccuracyMeters;
}

export function evaluateCourierGeoEligibility(
  restaurant: DispatchRestaurantPoint,
  candidate: Pick<DispatchCourierCandidate, "lat" | "lng" | "locationUpdatedAt" | "locationAccuracyM">,
  now = new Date(),
  maxLocationAgeSeconds = 120,
  maxAccuracyMeters = 100,
): CourierGeoEligibility {
  const reasons: CourierGeoEligibilityReason[] = [];
  const hasLocation = candidate.lat !== null && candidate.lng !== null;
  const gpsFresh = isFreshCourierLocation(candidate.locationUpdatedAt, now, maxLocationAgeSeconds);
  const gpsAccurate = isAccurateCourierLocation(candidate.locationAccuracyM, maxAccuracyMeters);

  if (!hasLocation) reasons.push("NO_LOCATION");
  if (!gpsFresh) reasons.push("STALE_LOCATION");
  if (!gpsAccurate) reasons.push("LOW_ACCURACY");

  const distanceKm = hasLocation
    ? haversineKm(restaurant.lat, restaurant.lng, candidate.lat!, candidate.lng!)
    : null;
  const dispatchRadiusKm = restaurant.courierDispatchRadiusKm ?? Number.POSITIVE_INFINITY;
  const inDispatchZone = distanceKm !== null && distanceKm <= dispatchRadiusKm;
  if (hasLocation && !inDispatchZone) reasons.push("OUTSIDE_DISPATCH_ZONE");

  return {
    eligible: reasons.length === 0,
    reasons,
    distanceKm,
    gpsFresh,
    gpsAccurate,
    inDispatchZone,
  };
}

/**
 * Pick the closest courier without turning "closest" into "always the same
 * person". A clearly closer courier still wins. When two or more couriers are
 * practically equivalent (within 750 m or 25% of the best distance), recent
 * offer load becomes the first tie-breaker.
 *
 * Geographic eligibility (fresh GPS, acceptable accuracy and dispatch radius)
 * is enforced here so automatic dispatch and manual tooling can share exactly
 * the same rule instead of having subtly different definitions of "nearby".
 */
export function chooseCourierCandidate(
  restaurant: DispatchRestaurantPoint,
  candidates: DispatchCourierCandidate[],
  now = new Date(),
  maxLocationAgeSeconds = 120,
  maxAccuracyMeters = 100,
): RankedCourierCandidate | null {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      eligibility: evaluateCourierGeoEligibility(
        restaurant,
        candidate,
        now,
        maxLocationAgeSeconds,
        maxAccuracyMeters,
      ),
    }))
    .filter(({ eligibility }) => eligibility.eligible && eligibility.distanceKm !== null)
    .map(({ candidate, eligibility }) => ({
      ...candidate,
      distanceKm: eligibility.distanceKm!,
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
