import { describe, expect, it } from "vitest";
import { assertQaOrderStatus, singleDeliveryStatusPlan } from "./singleDelivery.js";

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
});
