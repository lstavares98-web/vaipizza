import { prisma } from "../../config/prisma.js";
import { round2 } from "../../utils/pricing.js";
import { cashHeldByCourier } from "../couriers/cash.js";

// Only DELIVERY-kind earnings tied to one of this restaurant's own orders
// count here — BONUS rows (orderId null) are platform-wide milestone
// payouts, not this restaurant's cash liability, so they're settled
// separately (out of scope for now, see PROJECT_ANALYSIS follow-up).
export async function getPendingCashByCourier(restaurantId: string) {
  const unsettled = await prisma.courierEarning.findMany({
    where: {
      settledAt: null,
      kind: "DELIVERY",
      order: { restaurantId, paymentMethod: "CASH" },
    },
    include: { courier: { include: { user: true } }, order: true },
    orderBy: { createdAt: "asc" },
  });

  const byCourier = new Map<
    string,
    { courierId: string; courierName: string; total: number; orders: { orderId: string; orderNumber: number; amount: number }[] }
  >();
  for (const e of unsettled) {
    const key = e.courierId;
    const entry = byCourier.get(key) ?? {
      courierId: e.courierId,
      courierName: e.courier.user.name,
      total: 0,
      orders: [],
    };
    // What the courier owes back is the whole note the customer paid
    // with (e.g. a delivery of €20 paid with a €100 bill: the restaurant
    // already sent €80 change out with the courier, so after handing that
    // change to the customer the courier is left holding the full €100,
    // not just the €20 order value) — not the courier's own delivery fee.
    const cashHeld = e.order ? cashHeldByCourier(e.order.total, e.order.amountTendered) : 0;
    entry.total = round2(entry.total + cashHeld);
    if (e.order) entry.orders.push({ orderId: e.order.id, orderNumber: e.order.orderNumber, amount: cashHeld });
    byCourier.set(key, entry);
  }
  return Array.from(byCourier.values());
}

export async function settleCourierCash(restaurantId: string, courierId: string) {
  const result = await prisma.courierEarning.updateMany({
    where: {
      courierId,
      settledAt: null,
      kind: "DELIVERY",
      order: { restaurantId, paymentMethod: "CASH" },
    },
    data: { settledAt: new Date() },
  });
  return { settledCount: result.count };
}
