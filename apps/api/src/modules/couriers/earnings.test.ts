import { describe, expect, it } from "vitest";
import { computeDeliveryEarning } from "./earnings.js";

describe("computeDeliveryEarning", () => {
  it("pays the courier's share of the delivery fee with no bonus on a regular delivery", () => {
    const result = computeDeliveryEarning(4, 0);
    expect(result.base).toBe(2.8);
    expect(result.bonus).toBe(0);
    expect(result.total).toBe(2.8);
  });

  it("adds a milestone bonus on every 10th completed delivery", () => {
    const result = computeDeliveryEarning(4, 9); // this will be delivery #10
    expect(result.bonus).toBe(5);
    expect(result.total).toBe(7.8);
  });

  it("does not bonus deliveries just before/after the milestone", () => {
    expect(computeDeliveryEarning(4, 8).bonus).toBe(0); // #9
    expect(computeDeliveryEarning(4, 10).bonus).toBe(0); // #11
  });
});
