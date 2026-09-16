import { describe, expect, it } from "vitest";
import { buildAdminOrderWhere, lisbonDayBounds } from "./adminOrders.js";

describe("lisbonDayBounds", () => {
  it("maps a summer Lisbon business day to DST-aware UTC bounds", () => {
    const { start, end } = lisbonDayBounds("2026-07-15");
    expect(start.toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-15T23:00:00.000Z");
  });

  it("maps a winter Lisbon business day to UTC bounds", () => {
    const { start, end } = lisbonDayBounds("2026-01-15");
    expect(start.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });
});

describe("buildAdminOrderWhere", () => {
  it("builds exact order-number and status filters", () => {
    expect(buildAdminOrderWhere({ orderNumber: 47, status: "DELIVERED" })).toEqual({
      orderNumber: 47,
      status: "DELIVERED",
    });
  });

  it("combines a Lisbon date with restaurant and status filters", () => {
    const where = buildAdminOrderWhere({
      date: "2026-09-16",
      restaurantId: "restaurant-1",
      status: "CANCELLED",
    });

    expect(where).toEqual({
      restaurantId: "restaurant-1",
      status: "CANCELLED",
      createdAt: {
        gte: new Date("2026-09-15T23:00:00.000Z"),
        lt: new Date("2026-09-16T23:00:00.000Z"),
      },
    });
  });
});
