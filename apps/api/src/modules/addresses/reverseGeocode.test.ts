import { describe, expect, it, vi } from "vitest";
import { parseReverseGeocodeResponse, reverseGeocodeWithProvider } from "./reverseGeocode.js";

describe("parseReverseGeocodeResponse", () => {
  it("builds a useful Portuguese address suggestion from provider fields", () => {
    expect(parseReverseGeocodeResponse({
      display_name: "Rua do Exemplo 10, Braga, 4715-000, Portugal",
      address: {
        road: "Rua do Exemplo",
        house_number: "10",
        city: "Braga",
        postcode: "4715-000",
      },
    })).toEqual({
      line1: "Rua do Exemplo 10",
      city: "Braga",
      postalCode: "4715-000",
    });
  });

  it("falls back across locality fields and never invents a street", () => {
    expect(parseReverseGeocodeResponse({
      address: { town: "Vila Verde", postcode: "4730-000" },
    })).toEqual({ line1: "", city: "Vila Verde", postalCode: "4730-000" });
  });
});

describe("reverseGeocodeWithProvider", () => {
  it("returns null when no provider is configured", async () => {
    const fetcher = vi.fn();
    await expect(reverseGeocodeWithProvider(41.55, -8.42, "", fetcher as any)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails open when the provider is unavailable", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(reverseGeocodeWithProvider(41.55, -8.42, "https://geo.example/reverse", fetcher as any)).resolves.toBeNull();
  });

  it("requests coordinates and returns a normalized suggestion", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ address: { road: "Av. Central", city: "Braga", postcode: "4710-000" } }),
    });

    const result = await reverseGeocodeWithProvider(41.55, -8.42, "https://geo.example/reverse", fetcher as any);
    expect(result).toEqual({ line1: "Av. Central", city: "Braga", postalCode: "4710-000" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("lat=41.55");
    expect(String(url)).toContain("lon=-8.42");
  });
});
