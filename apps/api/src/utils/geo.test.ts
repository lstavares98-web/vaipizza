import { describe, expect, it } from "vitest";
import { calcDeliveryFee, haversineKm } from "./geo.js";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(41.5454, -8.4265, 41.5454, -8.4265)).toBe(0);
  });

  it("computes a plausible distance between two nearby points (~1-2km)", () => {
    const km = haversineKm(41.5454, -8.4265, 41.5518, -8.4229);
    expect(km).toBeGreaterThan(0.5);
    expect(km).toBeLessThan(2);
  });
});

const baseRestaurant = {
  deliveryFeeMode: "BASE_PLUS_PER_KM" as const,
  deliveryFeeBase: 2,
  deliveryFeePerKm: 0.5,
  deliveryFeeFreeKm: 2,
};

describe("calcDeliveryFee — BASE_PLUS_PER_KM", () => {
  it("charges just the base fee within the free radius", () => {
    expect(calcDeliveryFee(baseRestaurant, 1)).toBe(2);
    expect(calcDeliveryFee(baseRestaurant, 2)).toBe(2);
  });

  it("adds per-km charge beyond the free radius", () => {
    // 4km - 2km free = 2km extra * 0.5€/km = 1€ on top of the 2€ base
    expect(calcDeliveryFee(baseRestaurant, 4)).toBe(3);
  });
});

describe("calcDeliveryFee — TIERED", () => {
  const tiered = {
    deliveryFeeMode: "TIERED" as const,
    deliveryFeeBase: 0,
    deliveryFeePerKm: 0,
    deliveryFeeFreeKm: 0,
    deliveryFeeTiers: [
      { upToKm: 3, fee: 2 },
      { upToKm: 5, fee: 3 },
      { upToKm: 8, fee: 4.5 },
    ],
  };

  it("picks the first tier the distance fits within", () => {
    expect(calcDeliveryFee(tiered, 2)).toBe(2);
    expect(calcDeliveryFee(tiered, 3)).toBe(2);
    expect(calcDeliveryFee(tiered, 3.1)).toBe(3);
    expect(calcDeliveryFee(tiered, 5)).toBe(3);
    expect(calcDeliveryFee(tiered, 7)).toBe(4.5);
  });

  it("falls back to the last tier's fee beyond the highest bracket", () => {
    expect(calcDeliveryFee(tiered, 20)).toBe(4.5);
  });
});
