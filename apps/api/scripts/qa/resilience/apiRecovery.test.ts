import { describe, expect, it } from "vitest";
import {
  classifyTransportUncertainty,
  reconcileCheckoutAfterUncertainty,
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
});
