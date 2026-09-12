import { describe, expect, it } from "vitest";
import type { QaConfig } from "../types.js";
import {
  assertQaOrderStatus,
  runSingleDeliveryTransitions,
  singleDeliveryApiPlan,
  singleDeliveryCheckoutBody,
  singleDeliveryStatusPlan,
} from "./singleDelivery.js";

const config: QaConfig = {
  environment: "staging",
  apiUrl: "https://vaipizza-api-staging.onrender.com",
  apiHostname: "vaipizza-api-staging.onrender.com",
  allowedApiHosts: ["vaipizza-api-staging.onrender.com"],
  databaseHostname: "db.vnuowugruqheakomdtuh.supabase.co",
  databaseUsername: "postgres",
  databasePort: "5432",
  databaseName: "postgres",
  supabaseProjectRef: "vnuowugruqheakomdtuh",
  mutationConfirmation: "VAIPIZZA_STAGING_ONLY",
};

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

  it("drives restaurant, kitchen and courier through the complete API flow", async () => {
    const calls: Array<{ path: string; method?: string; token?: string; body?: unknown }> = [];
    const fakeRequest = async (_config: QaConfig, path: string, options: { method?: string; token?: string; body?: unknown } = {}) => {
      calls.push({ path, ...options });
      if (path === "/api/courier/assignments/current") {
        return { ok: true, status: 200, durationMs: 3, data: { success: true, assignment: { id: "assignment-1", order: { id: "order-1" } } } };
      }
      const bodyStatus = (options.body as { status?: string } | undefined)?.status;
      const status = path.endsWith("/accept")
        ? "COURIER_ASSIGNED"
        : bodyStatus === "ACCEPTED"
          ? "PREPARING"
          : bodyStatus === "READY_FOR_PICKUP"
            ? "WAITING_FOR_COURIER"
            : bodyStatus;
      return { ok: true, status: 200, durationMs: 2, data: { success: true, order: { id: "order-1", status } } };
    };

    const result = await runSingleDeliveryTransitions(
      config,
      "order-1",
      { staffToken: "staff-token", kitchenToken: "kitchen-token", courierToken: "courier-token" },
      fakeRequest as never,
    );

    expect(result.assignmentId).toBe("assignment-1");
    expect(result.finalStatus).toBe("DELIVERED");
    expect(calls.map((call) => call.path)).toEqual([
      "/api/restaurant/orders/order-1/status",
      "/api/restaurant/orders/order-1/status",
      "/api/courier/assignments/current",
      "/api/courier/assignments/assignment-1/accept",
      "/api/courier/orders/order-1/status",
      "/api/courier/orders/order-1/status",
      "/api/courier/orders/order-1/status",
    ]);
    expect(calls[0]?.token).toBe("staff-token");
    expect(calls[1]?.token).toBe("kitchen-token");
    expect(calls.slice(2).every((call) => call.token === "courier-token")).toBe(true);
  });
});
