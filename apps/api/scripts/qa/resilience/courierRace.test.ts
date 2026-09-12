import { describe, expect, it } from "vitest";
import { validateCourierRaceOutcome, type CourierRaceSnapshot } from "./courierRace.js";

describe("courier acceptance race validation", () => {
  it("passes with exactly one accepted winner and no competing active offer", () => {
    const snapshot: CourierRaceSnapshot = {
      orderId: "o1",
      orderCourierId: "c1",
      assignments: [
        { courierId: "c1", status: "ACCEPTED" },
        { courierId: "c2", status: "CANCELLED" },
      ],
      attempts: [
        { courierId: "c1", status: 200, accepted: true },
        { courierId: "c2", status: 409, accepted: false },
      ],
    };
    expect(() => validateCourierRaceOutcome(snapshot)).not.toThrow();
  });

  it("fails when two assignments become accepted", () => {
    const snapshot: CourierRaceSnapshot = {
      orderId: "o1",
      orderCourierId: "c1",
      assignments: [
        { courierId: "c1", status: "ACCEPTED" },
        { courierId: "c2", status: "ACCEPTED" },
      ],
      attempts: [
        { courierId: "c1", status: 200, accepted: true },
        { courierId: "c2", status: 200, accepted: true },
      ],
    };
    expect(() => validateCourierRaceOutcome(snapshot)).toThrow(/exactly one|multiple|winner/i);
  });

  it("fails when order ownership disagrees with the accepted assignment", () => {
    const snapshot: CourierRaceSnapshot = {
      orderId: "o1",
      orderCourierId: "c2",
      assignments: [
        { courierId: "c1", status: "ACCEPTED" },
        { courierId: "c2", status: "CANCELLED" },
      ],
      attempts: [
        { courierId: "c1", status: 200, accepted: true },
        { courierId: "c2", status: 409, accepted: false },
      ],
    };
    expect(() => validateCourierRaceOutcome(snapshot)).toThrow(/owner|courier/i);
  });

  it("fails when the losing courier still has an active OFFERED assignment", () => {
    const snapshot: CourierRaceSnapshot = {
      orderId: "o1",
      orderCourierId: "c1",
      assignments: [
        { courierId: "c1", status: "ACCEPTED" },
        { courierId: "c2", status: "OFFERED" },
      ],
      attempts: [
        { courierId: "c1", status: 200, accepted: true },
        { courierId: "c2", status: 409, accepted: false },
      ],
    };
    expect(() => validateCourierRaceOutcome(snapshot)).toThrow(/active|offered|losing/i);
  });

  it("fails when a losing accept attempt does not return conflict/unavailable", () => {
    const snapshot: CourierRaceSnapshot = {
      orderId: "o1",
      orderCourierId: "c1",
      assignments: [
        { courierId: "c1", status: "ACCEPTED" },
        { courierId: "c2", status: "CANCELLED" },
      ],
      attempts: [
        { courierId: "c1", status: 200, accepted: true },
        { courierId: "c2", status: 500, accepted: false },
      ],
    };
    expect(() => validateCourierRaceOutcome(snapshot)).toThrow(/losing|conflict|409/i);
  });
});
