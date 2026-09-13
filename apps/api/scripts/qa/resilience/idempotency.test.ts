import { describe, expect, it } from "vitest";
import {
  duplicateActionBlockingExternalCourierIds,
  validateDuplicateActionObservation,
  validateFinalDeliveryEffects,
} from "./idempotency.js";

describe("duplicate action courier isolation", () => {
  it("ignores stale external AVAILABLE couriers but blocks a fresh eligible one", () => {
    const now = new Date("2026-09-13T10:00:00Z");
    const blocked = duplicateActionBlockingExternalCourierIds({
      couriers: [
        {
          id: "external-stale",
          status: "AVAILABLE",
          lat: 41.5610096,
          lng: -8.4065289,
          locationUpdatedAt: new Date(now.getTime() - 121_000),
          locationAccuracyM: 10,
        },
        {
          id: "external-fresh",
          status: "AVAILABLE",
          lat: 41.5610096,
          lng: -8.4065289,
          locationUpdatedAt: now,
          locationAccuracyM: 10,
        },
        {
          id: "qa-fresh",
          status: "AVAILABLE",
          lat: 41.5610096,
          lng: -8.4065289,
          locationUpdatedAt: now,
          locationAccuracyM: 10,
        },
      ],
      qaCourierIds: ["qa-fresh"],
      restaurant: { lat: 41.5610096, lng: -8.4065289, courierDispatchRadiusKm: 12 },
      now,
      maxLocationAgeSeconds: 120,
      maxAccuracyMeters: 100,
    });

    expect(blocked).toEqual(["external-fresh"]);
  });
});

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
