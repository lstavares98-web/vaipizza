import { describe, expect, it } from "vitest";
import type { ProtectedSnapshot } from "./types.js";
import { compareProtectedSnapshots } from "./snapshot.js";

function sample(): ProtectedSnapshot {
  return {
    version: 1,
    restaurant: {
      id: "rest-1",
      slug: "vaipizza",
      name: "VaiPizza",
      lat: 41.55,
      lng: -8.42,
      deliveryRadiusKm: 8,
      courierDispatchRadiusKm: 12,
      deliveryFeeMode: "BASE_PLUS_PER_KM",
      deliveryFeeBase: 2,
      deliveryFeePerKm: 0.5,
      deliveryFeeFreeKm: 2,
      deliveryFeeTiers: [],
    },
    couriers: [{ id: "courier-1", userId: "user-1", verificationStatus: "APPROVED" }],
  };
}

describe("protected configuration comparison", () => {
  it("returns no diffs for identical snapshots", () => {
    const before = sample();
    const after = structuredClone(before);
    expect(compareProtectedSnapshots(before, after)).toEqual([]);
  });

  it("names a changed restaurant field", () => {
    const before = sample();
    const after = structuredClone(before);
    after.restaurant.deliveryRadiusKm = 9;
    expect(compareProtectedSnapshots(before, after)).toEqual([
      { path: "restaurant.deliveryRadiusKm", before: 8, after: 9 },
    ]);
  });

  it("detects protected courier verification changes", () => {
    const before = sample();
    const after = structuredClone(before);
    after.couriers[0]!.verificationStatus = "REJECTED";
    expect(compareProtectedSnapshots(before, after)).toEqual([
      { path: "couriers[0].verificationStatus", before: "APPROVED", after: "REJECTED" },
    ]);
  });
});
