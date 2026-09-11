import { describe, expect, it } from "vitest";
import {
  assertQaOrderStatus,
  singleDeliveryApiPlan,
  singleDeliveryCheckoutBody,
  singleDeliveryStatusPlan,
} from "./singleDelivery.js";

describe("single QA delivery scenario", () => {
  it("keeps the production delivery state sequence explicit", () => {
    expect(singleDeliveryStatusPlan()).toEqual([
      "NEW",
      "PREPARING",
      "WAITING_FOR_COURIER",
      "COURIER_ASSIGNED",
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
  });

  it("rejects an unexpected order status immediately", () => {
    expect(() => assertQaOrderStatus({ status: "PREPARING" }, "PREPARING", "restaurant accept")).not.toThrow();
    expect(() => assertQaOrderStatus({ status: "NEW" }, "PREPARING", "restaurant accept")).toThrow(/restaurant accept/i);
  });

  it("uses the same API transitions as the apps", () => {
    expect(singleDeliveryApiPlan("order-1", "assignment-1")).toEqual([
      { label: "restaurant accept", method: "PATCH", path: "/api/restaurant/orders/order-1/status", body: { status: "ACCEPTED" }, expectedStatus: "PREPARING" },
      { label: "kitchen ready", method: "PATCH", path: "/api/restaurant/orders/order-1/status", body: { status: "READY_FOR_PICKUP" }, expectedStatus: "WAITING_FOR_COURIER" },
      { label: "courier accept", method: "POST", path: "/api/courier/assignments/assignment-1/accept", body: undefined, expectedStatus: "COURIER_ASSIGNED" },
      { label: "courier pickup", method: "PATCH", path: "/api/courier/orders/order-1/status", body: { status: "PICKED_UP" }, expectedStatus: "PICKED_UP" },
      { label: "courier out for delivery", method: "PATCH", path: "/api/courier/orders/order-1/status", body: { status: "OUT_FOR_DELIVERY" }, expectedStatus: "OUT_FOR_DELIVERY" },
      { label: "courier delivered", method: "PATCH", path: "/api/courier/orders/order-1/status", body: { status: "DELIVERED" }, expectedStatus: "DELIVERED" },
    ]);
  });

  it("creates a deterministic cash-delivery checkout body", () => {
    expect(singleDeliveryCheckoutBody("address-1", "QA-20260911-191500")).toEqual({
      addressId: "address-1",
      fulfillmentType: "DELIVERY",
      paymentMethod: "CASH",
      notes: "[QA QA-20260911-191500] single-delivery",
      amountTendered: 50,
    });
  });
});
