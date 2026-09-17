import { env } from "../../config/env.js";
import { resolveGeocodeProviderUrl } from "./forwardGeocode.js";

export interface AddressSuggestion {
  line1: string;
  city: string;
  postalCode: string;
}

type ProviderResponse = {
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

export function parseReverseGeocodeResponse(payload: ProviderResponse): AddressSuggestion {
  const address = payload.address ?? {};
  const street = address.road ?? address.pedestrian ?? address.footway ?? "";
  const line1 = [street, address.house_number].filter(Boolean).join(" ").trim();
  const city = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? "";
  return {
    line1,
    city,
    postalCode: address.postcode ?? "",
  };
}

export async function reverseGeocodeWithProvider(
  lat: number,
  lng: number,
  providerUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<AddressSuggestion | null> {
  if (!providerUrl.trim()) return null;
  try {
    const url = new URL(providerUrl);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "VaiPizza/1.0 address-assistance",
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as ProviderResponse;
    return parseReverseGeocodeResponse(payload);
  } catch {
    return null;
  }
}

export function reverseGeocodeCoordinates(lat: number, lng: number) {
  return reverseGeocodeWithProvider(lat, lng, resolveGeocodeProviderUrl(env.REVERSE_GEOCODE_URL));
}
