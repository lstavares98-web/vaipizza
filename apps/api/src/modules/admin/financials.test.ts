import { describe, expect, it } from "vitest";
import { computeFinancials } from "./financials.js";

const order = (overrides: Partial<Parameters<typeof computeFinancials>[0][number]> = {}) => ({
  status: "DELIVERED",
  subtotal: 20,
  deliveryFee: 3,
  total: 23,
  restaurant: { commissionPercent: 20 },
  ...overrides,
});

describe("computeFinancials", () => {
  it("excludes cancelled orders from every figure", () => {
    const result = computeFinancials([order(), order({ status: "CANCELLED" })]);
    expect(result.orderCount).toBe(1);
    expect(result.gmv).toBe(23);
  });

  it("charges commission on subtotal only, never on the delivery fee", () => {
    const result = computeFinancials([order({ subtotal: 20, deliveryFee: 3, restaurant: { commissionPercent: 20 } })]);
    expect(result.platformCommission).toBe(4); // 20% of 20, not of 23
  });

  it("restaurant payout is subtotal minus commission", () => {
    const result = computeFinancials([order({ subtotal: 20, restaurant: { commissionPercent: 20 } })]);
    expect(result.restaurantPayout).toBe(16);
  });

  it("sums delivery fees separately from GMV split", () => {
    const result = computeFinancials([order({ deliveryFee: 3 }), order({ deliveryFee: 4.5 })]);
    expect(result.deliveryFees).toBe(7.5);
  });

  it("returns zeros for an empty order list", () => {
    const result = computeFinancials([]);
    expect(result).toEqual({ orderCount: 0, gmv: 0, platformCommission: 0, restaurantPayout: 0, deliveryFees: 0 });
  });
});
