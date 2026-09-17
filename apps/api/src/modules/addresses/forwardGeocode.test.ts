import { describe, expect, it, vi } from "vitest";
import { forwardGeocodeWithProvider, parseForwardGeocodeResponse, resolveGeocodeProviderUrl } from "./forwardGeocode.js";

describe("parseForwardGeocodeResponse", () => {
  it("maps Nominatim search rows into counter-friendly addresses", () => {
    expect(parseForwardGeocodeResponse([
      {
        lat: "41.5501",
        lon: "-8.4201",
        display_name: "Rua do Souto 10, Braga, Portugal",
        address: { road: "Rua do Souto", house_number: "10", city: "Braga", postcode: "4700-329" },
      },
    ])).toEqual([
      { line1: "Rua do Souto 10", city: "Braga", postalCode: "4700-329", lat: 41.5501, lng: -8.4201, displayName: "Rua do Souto 10, Braga, Portugal" },
    ]);
  });
});

describe("geocode provider resolution", () => {
  it("uses the public Nominatim reverse endpoint when staging has no provider configured", () => {
    expect(resolveGeocodeProviderUrl(" ")).toBe("https://nominatim.openstreetmap.org/reverse");
  });

  it("keeps an explicitly configured provider", () => {
    expect(resolveGeocodeProviderUrl("https://geo.example.test/reverse")).toBe("https://geo.example.test/reverse");
  });
});

describe("forwardGeocodeWithProvider", () => {
  it("derives the search endpoint from the configured reverse endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    await forwardGeocodeWithProvider("Rua do Souto 10, Braga", "https://nominatim.openstreetmap.org/reverse", fetcher as any);

    const calledUrl = fetcher.mock.calls[0]![0] as URL;
    expect(calledUrl.pathname).toBe("/search");
    expect(calledUrl.searchParams.get("q")).toContain("Rua do Souto 10, Braga");
    expect(calledUrl.searchParams.get("countrycodes")).toBe("pt");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
  });
});
