import { describe, expect, it } from "vitest";
import { computeChangeDue } from "./cash.js";

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
