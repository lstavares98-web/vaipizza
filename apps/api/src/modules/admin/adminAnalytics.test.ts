import { describe, expect, it } from "vitest";
import { aggregateAdminPeriod, cashSummaryFromRows, periodBounds } from "./adminAnalytics.js";

describe("cashSummaryFromRows", () => {
  it("groups only unsettled cash delivery rows and uses the full tendered amount", () => {
    const summary = cashSummaryFromRows([
      {
        courierId: "courier-1",
        courierName: "Luiz",
        orderId: "order-47",
        orderNumber: 47,
        orderTotal: 15.5,
        amountTendered: 20,
        paymentMethod: "CASH",
        kind: "DELIVERY",
        settledAt: null,
      },
      {
        courierId: "courier-1",
        courierName: "Luiz",
        orderId: "order-48",
        orderNumber: 48,
        orderTotal: 12.3,
        amountTendered: null,
        paymentMethod: "CASH",
        kind: "DELIVERY",
        settledAt: null,
      },
      {
        courierId: "courier-2",
        courierName: "Teste",
        orderId: "order-49",
        orderNumber: 49,
        orderTotal: 9.99,
        amountTendered: 10,
        paymentMethod: "CASH",
        kind: "DELIVERY",
        settledAt: new Date("2026-09-16T22:00:00Z"),
      },
      {
        courierId: "courier-2",
        courierName: "Teste",
        orderId: "order-50",
        orderNumber: 50,
        orderTotal: 22,
        amountTendered: null,
        paymentMethod: "CARD",
        kind: "DELIVERY",
        settledAt: null,
      },
      {
        courierId: "courier-2",
        courierName: "Teste",
        orderId: null,
        orderNumber: null,
        orderTotal: null,
        amountTendered: null,
        paymentMethod: null,
        kind: "BONUS",
        settledAt: null,
      },
    ]);

    expect(summary).toEqual({
      total: 32.3,
      courierCount: 1,
      couriers: [
        {
          courierId: "courier-1",
          courierName: "Luiz",
          total: 32.3,
          orders: [
            { orderId: "order-47", orderNumber: 47, amount: 20 },
            { orderId: "order-48", orderNumber: 48, amount: 12.3 },
          ],
        },
      ],
    });
  });

  it("rounds combined cash liabilities to cents and exposes no courier-control fields", () => {
    const summary = cashSummaryFromRows([
      {
        courierId: "courier-1",
        courierName: "Luiz",
        orderId: "a",
        orderNumber: 1,
        orderTotal: 0.1,
        amountTendered: null,
        paymentMethod: "CASH",
        kind: "DELIVERY",
        settledAt: null,
      },
      {
        courierId: "courier-1",
        courierName: "Luiz",
        orderId: "b",
        orderNumber: 2,
        orderTotal: 0.2,
        amountTendered: null,
        paymentMethod: "CASH",
        kind: "DELIVERY",
        settledAt: null,
      },
    ]);

    expect(summary.total).toBe(0.3);
    expect(summary.couriers[0]?.total).toBe(0.3);
    expect(summary.couriers[0]).not.toHaveProperty("status");
    expect(summary.couriers[0]).not.toHaveProperty("operationalState");
    expect(summary.couriers[0]).not.toHaveProperty("eligibleForDispatch");
  });
});

describe("periodBounds", () => {
  it("uses Lisbon local days for a 7-day summer period", () => {
    const bounds = periodBounds("7d", new Date("2026-07-15T12:00:00Z"), "Europe/Lisbon");
    expect(bounds.start.toISOString()).toBe("2026-07-08T23:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-07-15T23:00:00.000Z");
  });
});

describe("aggregateAdminPeriod", () => {
  it("excludes cancelled orders and aggregates trend, products, combos and fulfillment mix", () => {
    const result = aggregateAdminPeriod([
      {
        status: "DELIVERED",
        createdAt: new Date("2026-09-16T10:00:00Z"),
        subtotal: 20,
        deliveryFee: 2,
        total: 22,
        fulfillmentType: "DELIVERY",
        restaurant: { commissionPercent: 20 },
        items: [
          { productNameSnapshot: "Pizza Margherita", comboId: null, quantity: 2, lineTotal: 16 },
          { productNameSnapshot: "Combo Família", comboId: "combo-1", quantity: 1, lineTotal: 4 },
        ],
      },
      {
        status: "COLLECTED",
        createdAt: new Date("2026-09-16T11:00:00Z"),
        subtotal: 10,
        deliveryFee: 0,
        total: 10,
        fulfillmentType: "PICKUP",
        restaurant: { commissionPercent: 20 },
        items: [{ productNameSnapshot: "Pizza Margherita", comboId: null, quantity: 1, lineTotal: 10 }],
      },
      {
        status: "CANCELLED",
        createdAt: new Date("2026-09-16T12:00:00Z"),
        subtotal: 99,
        deliveryFee: 5,
        total: 104,
        fulfillmentType: "DELIVERY",
        restaurant: { commissionPercent: 20 },
        items: [{ productNameSnapshot: "Não contar", comboId: null, quantity: 10, lineTotal: 99 }],
      },
    ], "Europe/Lisbon");

    expect(result.orderCount).toBe(2);
    expect(result.gmv).toBe(32);
    expect(result.averageTicket).toBe(16);
    expect(result.platformCommission).toBe(6);
    expect(result.restaurantPayout).toBe(24);
    expect(result.deliveryFees).toBe(2);
    expect(result.trend).toEqual([{ date: "2026-09-16", orders: 2, revenue: 32 }]);
    expect(result.topProducts).toEqual([{ name: "Pizza Margherita", quantity: 3, revenue: 26 }]);
    expect(result.topCombos).toEqual([{ name: "Combo Família", quantity: 1, revenue: 4 }]);
    expect(result.fulfillmentMix).toEqual([
      { type: "DELIVERY", count: 1 },
      { type: "PICKUP", count: 1 },
    ]);
  });

  it("caps product rankings at five entries", () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      productNameSnapshot: `Produto ${index + 1}`,
      comboId: null,
      quantity: 7 - index,
      lineTotal: 7 - index,
    }));
    const result = aggregateAdminPeriod([
      {
        status: "DELIVERED",
        createdAt: new Date("2026-09-16T10:00:00Z"),
        subtotal: 27,
        deliveryFee: 0,
        total: 27,
        fulfillmentType: "DELIVERY",
        restaurant: { commissionPercent: 0 },
        items,
      },
    ], "Europe/Lisbon");

    expect(result.topProducts).toHaveLength(5);
    expect(result.topProducts[0]?.name).toBe("Produto 1");
    expect(result.topProducts.some((item) => item.name === "Produto 6")).toBe(false);
  });
});
