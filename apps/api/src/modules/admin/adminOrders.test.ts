import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const orderFindMany = vi.fn();
  return {
    orderFindMany,
    prisma: {
      order: { findMany: orderFindMany },
    },
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));

import { buildAdminOrderWhere, lisbonDayBounds, listAdminOrders } from "./adminOrders.js";

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("listAdminOrders", () => {
  it("normalizes an anonymous manual order so the Admin can render it safely", async () => {
    state.orderFindMany.mockResolvedValueOnce([
      {
        id: "order-50",
        orderNumber: 50,
        user: null,
        customerNameSnapshot: null,
        customerPhoneSnapshot: null,
        deliveryLine1Snapshot: null,
        deliveryLine2Snapshot: null,
        deliveryCitySnapshot: null,
        deliveryPostalCodeSnapshot: null,
        customerLat: null,
        customerLng: null,
      },
    ]);

    const orders = await listAdminOrders({});

    expect(orders[0]?.user).toEqual({ name: "Cliente de balcão", phone: null });
  });
});
