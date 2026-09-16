import { describe, expect, it } from "vitest";
import { cashSummaryFromRows } from "./adminAnalytics.js";

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
