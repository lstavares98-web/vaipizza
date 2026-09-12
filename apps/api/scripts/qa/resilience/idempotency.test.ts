import { describe, expect, it } from "vitest";
import {
  validateDuplicateActionObservation,
  validateFinalDeliveryEffects,
} from "./idempotency.js";

describe("duplicate action result validation", () => {
  it("accepts one success plus a clear client conflict/validation response", () => {
    expect(() => validateDuplicateActionObservation({
      label: "PICKED_UP",
      statuses: [200, 400],
      finalStatus: "PICKED_UP",
      expectedStatus: "PICKED_UP",
    })).not.toThrow();
  });

  it("accepts two successful responses only when authoritative state is still correct", () => {
    expect(() => validateDuplicateActionObservation({
      label: "PREPARING",
      statuses: [200, 200],
      finalStatus: "PREPARING",
      expectedStatus: "PREPARING",
    })).not.toThrow();
  });

  it("rejects a server error or contradictory final state", () => {
    expect(() => validateDuplicateActionObservation({
      label: "DELIVERED",
      statuses: [200, 500],
      finalStatus: "DELIVERED",
      expectedStatus: "DELIVERED",
    })).toThrow(/server|500/i);
    expect(() => validateDuplicateActionObservation({
      label: "PICKED_UP",
      statuses: [200, 409],
      finalStatus: "COURIER_ASSIGNED",
      expectedStatus: "PICKED_UP",
    })).toThrow(/final|state/i);
  });
});

describe("final duplicate-delivery financial audit", () => {
  it("passes with one delivery earning and one lifetime increment", () => {
    expect(() => validateFinalDeliveryEffects({
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      courierStatus: "AVAILABLE",
      deliveryEarningCount: 1,
      lifetimeDeliveriesDelta: 1,
    })).not.toThrow();
  });

  it("fails duplicate delivery earnings or lifetime increments", () => {
    expect(() => validateFinalDeliveryEffects({
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      courierStatus: "AVAILABLE",
      deliveryEarningCount: 2,
      lifetimeDeliveriesDelta: 2,
    })).toThrow(/earning|lifetime|duplicate/i);
  });
});
