import { describe, expect, it } from "vitest";
import { canRestaurantStartOrder } from "./paymentPolicy.js";

describe("canRestaurantStartOrder", () => {
  it("blocks pending MB WAY and permits it once paid", () => {
    expect(canRestaurantStartOrder("MBWAY", "PENDING")).toBe(false);
    expect(canRestaurantStartOrder("MBWAY", "PAID")).toBe(true);
  });

  it("does not block cash or terminal orders awaiting handoff payment", () => {
    expect(canRestaurantStartOrder("CASH", "PENDING")).toBe(true);
    expect(canRestaurantStartOrder("TERMINAL", "PENDING")).toBe(true);
  });
});
