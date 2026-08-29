import { describe, expect, it } from "vitest";
import { ORDER_TRANSITIONS, OrderStatus } from "./index.js";

describe("ORDER_TRANSITIONS", () => {
  it("covers every OrderStatus value", () => {
    const statuses = Object.values(OrderStatus);
    for (const status of statuses) {
      expect(ORDER_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("every listed next-status is itself a valid OrderStatus", () => {
    const valid = new Set(Object.values(OrderStatus));
    for (const entry of Object.values(ORDER_TRANSITIONS)) {
      for (const next of entry.next) {
        expect(valid.has(next)).toBe(true);
      }
    }
  });

  it("terminal states (DELIVERED, COLLECTED, CANCELLED) have no further transitions", () => {
    expect(ORDER_TRANSITIONS.DELIVERED.next).toEqual([]);
    expect(ORDER_TRANSITIONS.COLLECTED.next).toEqual([]);
    expect(ORDER_TRANSITIONS.CANCELLED.next).toEqual([]);
  });

  it("only the restaurant can move NEW -> ACCEPTED", () => {
    expect(ORDER_TRANSITIONS.NEW.actor).toBe("RESTAURANT_OWNER");
    expect(ORDER_TRANSITIONS.NEW.next).toContain("ACCEPTED");
  });

  it("only the courier can move COURIER_ASSIGNED -> PICKED_UP -> OUT_FOR_DELIVERY -> DELIVERED", () => {
    expect(ORDER_TRANSITIONS.COURIER_ASSIGNED.actor).toBe("COURIER");
    expect(ORDER_TRANSITIONS.PICKED_UP.actor).toBe("COURIER");
    expect(ORDER_TRANSITIONS.OUT_FOR_DELIVERY.actor).toBe("COURIER");
  });
});
