import { describe, expect, it } from "vitest";
import { QaDroppedResponseError, QaTimeoutError } from "./faultTransport.js";
import {
  classifyTransportUncertainty,
  reconcileCheckoutAfterUncertainty,
  recoverCheckoutAfterUncertainMutation,
  validateRecoveredCheckout,
} from "./apiRecovery.js";

describe("API recovery reconciliation", () => {
  it("treats timeout and dropped responses as UNKNOWN until authoritative reread", () => {
    expect(classifyTransportUncertainty("TIMEOUT")).toBe("UNKNOWN");
    expect(classifyTransportUncertainty("DROPPED_RESPONSE")).toBe("UNKNOWN");
  });

  it("reconciles no authoritative order as NO_ORDER", () => {
    expect(reconcileCheckoutAfterUncertainty([])).toEqual({ kind: "NO_ORDER", orderIds: [] });
  });

  it("reconciles one unique authoritative order as ONE_ORDER", () => {
    expect(reconcileCheckoutAfterUncertainty(["order-1", "order-1"])).toEqual({
      kind: "ONE_ORDER",
      orderIds: ["order-1"],
      orderId: "order-1",
    });
  });

  it("detects duplicate authoritative orders after an uncertain checkout", () => {
    const state = reconcileCheckoutAfterUncertainty(["order-1", "order-2"]);
    expect(state).toEqual({
      kind: "DUPLICATE_ORDERS",
      orderIds: ["order-1", "order-2"],
    });
    expect(() => validateRecoveredCheckout(state)).toThrow(/duplicate.*uncertain checkout/i);
  });

  it("accepts exactly one authoritative order after recovery", () => {
    const state = reconcileCheckoutAfterUncertainty(["order-1"]);
    expect(() => validateRecoveredCheckout(state)).not.toThrow();
  });

  it("rereads authoritative state after a timeout instead of treating timeout as order failure", async () => {
    const remembered: string[][] = [];
    const result = await recoverCheckoutAfterUncertainMutation(
      async () => {
        throw new QaTimeoutError("checkout", 5);
      },
      async () => ["order-1"],
      async (ids) => {
        remembered.push([...ids]);
      },
    );

    expect(result.transportOutcome).toBe("UNKNOWN");
    expect(result.state).toEqual({ kind: "ONE_ORDER", orderIds: ["order-1"], orderId: "order-1" });
    expect(remembered).toEqual([["order-1"]]);
  });

  it("records discovered orders before rejecting duplicate recovery state", async () => {
    const events: string[] = [];

    await expect(
      recoverCheckoutAfterUncertainMutation(
        async () => {
          throw new QaDroppedResponseError("checkout-response");
        },
        async () => ["order-1", "order-2"],
        async (ids) => {
          events.push(`remember:${ids.join(",")}`);
        },
      ),
    ).rejects.toThrow(/duplicate.*uncertain checkout/i);

    expect(events).toEqual(["remember:order-1,order-2"]);
  });

  it("does not swallow unrelated application failures", async () => {
    await expect(
      recoverCheckoutAfterUncertainMutation(
        async () => {
          throw new Error("application-bug");
        },
        async () => ["order-1"],
        async () => undefined,
      ),
    ).rejects.toThrow("application-bug");
  });
});
