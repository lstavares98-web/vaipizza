import { describe, expect, it } from "vitest";
import {
  assertFunctionalDeliveredState,
  combineFunctionalAndCleanupErrors,
  runWithGuaranteedCleanup,
} from "./functional.js";

describe("functional QA final validation", () => {
  it("accepts a delivered cash order visible in courier history with earnings", () => {
    expect(() => assertFunctionalDeliveredState({
      orderId: "order-1",
      customerOrder: { id: "order-1", status: "DELIVERED", paymentStatus: "PAID" },
      courierHistory: [{ id: "order-1", status: "DELIVERED" }],
      courierEarnings: { lifetimeDeliveries: 1, today: { deliveries: 1, total: 4 } },
    })).not.toThrow();
  });

  it("rejects a delivered order missing from courier history", () => {
    expect(() => assertFunctionalDeliveredState({
      orderId: "order-1",
      customerOrder: { id: "order-1", status: "DELIVERED", paymentStatus: "PAID" },
      courierHistory: [],
      courierEarnings: { lifetimeDeliveries: 1, today: { deliveries: 1, total: 4 } },
    })).toThrow(/history/i);
  });

  it("rejects cash delivery that did not become paid", () => {
    expect(() => assertFunctionalDeliveredState({
      orderId: "order-1",
      customerOrder: { id: "order-1", status: "DELIVERED", paymentStatus: "PENDING" },
      courierHistory: [{ id: "order-1", status: "DELIVERED" }],
      courierEarnings: { lifetimeDeliveries: 1, today: { deliveries: 1, total: 4 } },
    })).toThrow(/payment/i);
  });

  it("preserves both scenario and cleanup failures", () => {
    const error = combineFunctionalAndCleanupErrors(new Error("scenario failed"), new Error("cleanup failed"));
    expect(error.message).toMatch(/scenario failed/i);
    expect(error.message).toMatch(/cleanup failed/i);
  });

  it("always runs cleanup after a successful scenario", async () => {
    const events: string[] = [];
    const result = await runWithGuaranteedCleanup(
      async () => { events.push("scenario"); return "ok"; },
      async () => { events.push("cleanup"); },
    );
    expect(result).toBe("ok");
    expect(events).toEqual(["scenario", "cleanup"]);
  });

  it("runs cleanup after a failed scenario and keeps the scenario error", async () => {
    const events: string[] = [];
    await expect(runWithGuaranteedCleanup(
      async () => { events.push("scenario"); throw new Error("scenario failed"); },
      async () => { events.push("cleanup"); },
    )).rejects.toThrow(/scenario failed/i);
    expect(events).toEqual(["scenario", "cleanup"]);
  });

  it("reports cleanup failure even when the scenario also failed", async () => {
    await expect(runWithGuaranteedCleanup(
      async () => { throw new Error("scenario failed"); },
      async () => { throw new Error("cleanup failed"); },
    )).rejects.toThrow(/cleanup also failed/i);
  });
});
