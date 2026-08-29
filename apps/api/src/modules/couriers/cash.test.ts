import { describe, expect, it } from "vitest";
import { cashHeldByCourier, computeChangeDue } from "./cash.js";

describe("computeChangeDue", () => {
  it("computes the change owed to the customer", () => {
    expect(computeChangeDue(13.9, 20)).toBe(6.1);
  });

  it("returns 0 when the customer pays the exact amount", () => {
    expect(computeChangeDue(13.9, 13.9)).toBe(0);
  });

  it("rejects a tendered amount below the order total", () => {
    expect(() => computeChangeDue(13.9, 10)).toThrowError(/inferior ao total/);
  });
});

describe("cashHeldByCourier", () => {
  it("is the full note tendered, not the order total — the restaurant already advanced the change", () => {
    // €20 order paid with a €100 note: courier hands back €80 change
    // (fronted by the restaurant) and is left holding the whole €100.
    expect(cashHeldByCourier(20, 100)).toBe(100);
  });

  it("falls back to the order total when no amount was declared", () => {
    expect(cashHeldByCourier(13.9, null)).toBe(13.9);
  });
});
