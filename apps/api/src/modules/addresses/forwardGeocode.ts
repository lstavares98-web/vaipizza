import { env } from "../../config/env.js";

const DEFAULT_GEOCODE_PROVIDER_URL = "https://nominatim.openstreetmap.org/reverse";

export function resolveGeocodeProviderUrl(configuredUrl: string): string {
  return configuredUrl.trim() || DEFAULT_GEOCODE_PROVIDER_URL;
}

export interface ForwardGeocodeSuggestion {
  line1: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  displayName: string;
}

type ProviderRow = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    postcode?: string;
  };
};

export function parseForwardGeocodeResponse(payload: ProviderRow[]): ForwardGeocodeSuggestion[] {
  return payload.flatMap((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    const address = row.address ?? {};
    const street = address.road ?? address.pedestrian ?? address.footway ?? "";
    const line1 = [street, address.house_number].filter(Boolean).join(" ").trim();
    const city = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? "";

    return [{
      line1,
      city,
      postalCode: address.postcode ?? "",
      lat,
      lng,
      displayName: row.display_name ?? [line1, city].filter(Boolean).join(", "),
    }];
  });
}

export async function forwardGeocodeWithProvider(
  query: string,
  providerUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<ForwardGeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed || !providerUrl.trim()) return [];

  try {
    const url = new URL(providerUrl);
    url.pathname = url.pathname.replace(/\/reverse\/?$/, "/search");
    if (!url.pathname.endsWith("/search")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/search`;
    }
    url.search = "";
    url.searchParams.set("q", trimmed);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "pt");
    url.searchParams.set("limit", "5");

    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "VaiPizza/1.0 counter-address-search",
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return [];
    const payload = await response.json() as ProviderRow[];
    return parseForwardGeocodeResponse(Array.isArray(payload) ? payload : []);
  } catch {
    return [];
  }
}

export function searchAddressCoordinates(query: string) {
  return forwardGeocodeWithProvider(query, resolveGeocodeProviderUrl(env.REVERSE_GEOCODE_URL));
}
