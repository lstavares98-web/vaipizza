import { describe, expect, it } from "vitest";
import {
  dispatchEligibilityExpectation,
  validateRejectReassignment,
  type DispatchEligibilityInput,
} from "./dispatchModes.js";

describe("dispatch eligibility expectation table", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  const base: DispatchEligibilityInput = {
    status: "AVAILABLE",
    distanceKm: 1,
    dispatchRadiusKm: 12,
    locationUpdatedAtMs: now,
    nowMs: now,
    maxLocationAgeSeconds: 120,
    accuracyM: 10,
    maxAccuracyM: 100,
  };

  it("marks a fresh accurate in-radius AVAILABLE courier eligible", () => {
    expect(dispatchEligibilityExpectation(base)).toEqual({ eligible: true, reason: null });
  });

  it.each([
    ["offline", { status: "OFFLINE" }],
    ["stale", { locationUpdatedAtMs: now - 121_000 }],
    ["inaccurate", { accuracyM: 101 }],
    ["outside", { distanceKm: 12.1 }],
  ] as const)("marks %s courier ineligible", (_name, patch) => {
    expect(dispatchEligibilityExpectation({ ...base, ...patch }).eligible).toBe(false);
  });
});

describe("reject then reassign validation", () => {
  it("passes when rejected courier stays rejected and next courier owns the order", () => {
    expect(() => validateRejectReassignment({
      orderCourierId: "c2",
      firstCourierId: "c1",
      secondCourierId: "c2",
      firstAssignmentStatus: "REJECTED",
      secondAssignmentStatus: "ACCEPTED",
      rejectedAssignmentAcceptStatus: 409,
    })).not.toThrow();
  });

  it("fails when rejected courier can later accept the old offer", () => {
    expect(() => validateRejectReassignment({
      orderCourierId: "c2",
      firstCourierId: "c1",
      secondCourierId: "c2",
      firstAssignmentStatus: "ACCEPTED",
      secondAssignmentStatus: "ACCEPTED",
      rejectedAssignmentAcceptStatus: 200,
    })).toThrow(/rejected|old offer|409/i);
  });
});
