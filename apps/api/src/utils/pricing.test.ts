import { describe, expect, it } from "vitest";
import { computeCouponDiscount, computeSplitBasePrice, computeUnitPrice, round2 } from "./pricing.js";

describe("computeUnitPrice", () => {
  it("returns base price with no modifiers", () => {
    expect(computeUnitPrice(9, [])).toBe(9);
  });

  it("sums positive modifier deltas (e.g. Large +3, Bacon +2)", () => {
    expect(computeUnitPrice(9, [{ priceDelta: 3 }, { priceDelta: 2 }])).toBe(14);
  });

  it("handles fractional deltas without floating point drift", () => {
    expect(computeUnitPrice(9, [{ priceDelta: 1.5 }, { priceDelta: 1 }])).toBe(11.5);
  });
});

describe("computeSplitBasePrice", () => {
  it("MOST_EXPENSIVE picks the higher of the two halves", () => {
    expect(computeSplitBasePrice(9, 11, "MOST_EXPENSIVE")).toBe(11);
    expect(computeSplitBasePrice(11, 9, "MOST_EXPENSIVE")).toBe(11);
  });

  it("AVERAGE splits the difference", () => {
    expect(computeSplitBasePrice(9, 11, "AVERAGE")).toBe(10);
  });

  it("AVERAGE rounds to 2 decimals", () => {
    expect(computeSplitBasePrice(9, 10, "AVERAGE")).toBe(9.5);
    expect(computeSplitBasePrice(9, 9.01, "AVERAGE")).toBe(round2((9 + 9.01) / 2));
  });
});

describe("computeCouponDiscount", () => {
  it("applies a percentage discount", () => {
    expect(computeCouponDiscount(20, { percentOff: 15 })).toBe(3);
  });

  it("applies a flat amount discount", () => {
    expect(computeCouponDiscount(20, { amountOff: 5 })).toBe(5);
  });

  it("never discounts more than the subtotal (order can't go negative)", () => {
    expect(computeCouponDiscount(4, { amountOff: 15 })).toBe(4);
    expect(computeCouponDiscount(4, { percentOff: 100 })).toBe(4);
  });
});
