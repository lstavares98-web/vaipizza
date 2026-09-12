import { describe, expect, it } from "vitest";
import {
  classifyDirectCheckoutSettled,
  createStartBarrier,
  validateSameCartConcurrentCheckout,
  type ConcurrentCheckoutAttemptResult,
} from "./concurrentCheckout.js";

describe("concurrent checkout start barrier", () => {
  it("holds prepared operations until release and then lets all start", async () => {
    const barrier = createStartBarrier();
    const events: string[] = [];

    const pending = [0, 1, 2].map(async (index) => {
      await barrier.wait();
      events.push(`start-${index}`);
      return index;
    });

    await Promise.resolve();
    expect(events).toEqual([]);

    barrier.release();
    const results = await Promise.all(pending);
    expect(results).toEqual([0, 1, 2]);
    expect(events).toEqual(["start-0", "start-1", "start-2"]);
  });
});

describe("same-cart concurrent checkout validation", () => {
  it("passes when only one request creates an order", () => {
    const results: ConcurrentCheckoutAttemptResult[] = [
      { kind: "ACCEPTED", orderId: "order-1", status: 201 },
      { kind: "REJECTED", status: 409, code: "CART_EMPTY" },
    ];
    expect(() => validateSameCartConcurrentCheckout(results)).not.toThrow();
  });

  it("fails when two distinct orders are created from the same cart", () => {
    const results: ConcurrentCheckoutAttemptResult[] = [
      { kind: "ACCEPTED", orderId: "order-1", status: 201 },
      { kind: "ACCEPTED", orderId: "order-2", status: 201 },
    ];
    expect(() => validateSameCartConcurrentCheckout(results)).toThrow(/duplicate-same-cart-checkout/i);
  });

  it("does not treat an OUT_OF_RANGE response as an accepted order", () => {
    const results: ConcurrentCheckoutAttemptResult[] = [
      { kind: "OUT_OF_RANGE", status: 400, code: "OUT_OF_RANGE" },
      { kind: "REJECTED", status: 409, code: "CART_EMPTY" },
    ];
    expect(() => validateSameCartConcurrentCheckout(results)).not.toThrow();
  });

  it("classifies a direct service winner and an AppError loser", () => {
    expect(classifyDirectCheckoutSettled({
      status: "fulfilled",
      value: { order: { id: "order-1" } },
    })).toEqual({ kind: "ACCEPTED", orderId: "order-1", status: 200 });

    expect(classifyDirectCheckoutSettled({
      status: "rejected",
      reason: { statusCode: 400, code: "CART_ALREADY_CHECKED_OUT" },
    })).toEqual({ kind: "REJECTED", status: 400, code: "CART_ALREADY_CHECKED_OUT" });
  });
});
