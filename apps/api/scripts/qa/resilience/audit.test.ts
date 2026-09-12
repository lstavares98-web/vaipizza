import { describe, expect, it } from "vitest";
import { validateOrderAudit } from "./audit.js";

describe("resilience order audit", () => {
  it("passes when order, assignment and courier ownership agree", () => {
    expect(() => validateOrderAudit({
      orderId: "o1",
      orderStatus: "COURIER_ASSIGNED",
      paymentStatus: "PENDING",
      orderCourierId: "c1",
      acceptedAssignmentCourierIds: ["c1"],
      activeAssignmentCourierIds: ["c1"],
      deliveryEarningCount: 0,
      waitingForCourier: false,
    })).not.toThrow();
  });

  it("fails when two couriers have accepted ownership of one order", () => {
    expect(() => validateOrderAudit({
      orderId: "o1",
      orderStatus: "COURIER_ASSIGNED",
      paymentStatus: "PENDING",
      orderCourierId: "c1",
      acceptedAssignmentCourierIds: ["c1", "c2"],
      activeAssignmentCourierIds: ["c1", "c2"],
      deliveryEarningCount: 0,
      waitingForCourier: false,
    })).toThrow(/multiple|owner/i);
  });

  it("fails when the order courier disagrees with the accepted assignment", () => {
    expect(() => validateOrderAudit({
      orderId: "o1",
      orderStatus: "COURIER_ASSIGNED",
      paymentStatus: "PENDING",
      orderCourierId: "c2",
      acceptedAssignmentCourierIds: ["c1"],
      activeAssignmentCourierIds: ["c1"],
      deliveryEarningCount: 0,
      waitingForCourier: false,
    })).toThrow(/courier|assignment/i);
  });

  it("fails when a single order has duplicate delivery earnings", () => {
    expect(() => validateOrderAudit({
      orderId: "o1",
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      orderCourierId: "c1",
      acceptedAssignmentCourierIds: ["c1"],
      activeAssignmentCourierIds: [],
      deliveryEarningCount: 2,
      waitingForCourier: false,
    })).toThrow(/earning|financial|duplicate/i);
  });
});
