import { describe, expect, it } from "vitest";
import { canReceiveQueuedOffer, shouldConsiderBusyCouriers } from "./queuedDispatch.policy.js";

describe("queued dispatch policy", () => {
  it("allows exactly one next reservation for an approved geo-eligible busy courier", () => {
    expect(canReceiveQueuedOffer({ activeDeliveryCount: 1, queuedAcceptedCount: 0, geoEligible: true, approved: true })).toBe(true);
  });

  it("rejects a second queued reservation or a courier without an active delivery", () => {
    expect(canReceiveQueuedOffer({ activeDeliveryCount: 1, queuedAcceptedCount: 1, geoEligible: true, approved: true })).toBe(false);
    expect(canReceiveQueuedOffer({ activeDeliveryCount: 0, queuedAcceptedCount: 0, geoEligible: true, approved: true })).toBe(false);
  });

  it("rejects unapproved or geo-ineligible busy couriers", () => {
    expect(canReceiveQueuedOffer({ activeDeliveryCount: 1, queuedAcceptedCount: 0, geoEligible: false, approved: true })).toBe(false);
    expect(canReceiveQueuedOffer({ activeDeliveryCount: 1, queuedAcceptedCount: 0, geoEligible: true, approved: false })).toBe(false);
  });

  it("only considers busy couriers after the free eligible pool is empty", () => {
    expect(shouldConsiderBusyCouriers(2)).toBe(false);
    expect(shouldConsiderBusyCouriers(0)).toBe(true);
  });
});
