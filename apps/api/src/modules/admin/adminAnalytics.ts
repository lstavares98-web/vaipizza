import { prisma } from "../../config/prisma.js";
import { round2 } from "../../utils/pricing.js";
import { cashHeldByCourier } from "../couriers/cash.js";

export interface PendingCashRow {
  courierId: string;
  courierName: string;
  orderId: string | null;
  orderNumber: number | null;
  orderTotal: number | null;
  amountTendered: number | null;
  paymentMethod: string | null;
  kind: string;
  settledAt: Date | null;
}

export interface PendingCashOrderSummary {
  orderId: string;
  orderNumber: number;
  amount: number;
}

export interface PendingCashCourierSummary {
  courierId: string;
  courierName: string;
  total: number;
  orders: PendingCashOrderSummary[];
}

export interface PendingCashSummary {
  total: number;
  courierCount: number;
  couriers: PendingCashCourierSummary[];
}

export function cashSummaryFromRows(rows: PendingCashRow[]): PendingCashSummary {
  const grouped = new Map<string, PendingCashCourierSummary>();

  for (const row of rows) {
    if (
      row.settledAt !== null ||
      row.kind !== "DELIVERY" ||
      row.paymentMethod !== "CASH" ||
      row.orderId === null ||
      row.orderNumber === null ||
      row.orderTotal === null
    ) {
      continue;
    }

    const amount = cashHeldByCourier(row.orderTotal, row.amountTendered);
    const current = grouped.get(row.courierId) ?? {
      courierId: row.courierId,
      courierName: row.courierName,
      total: 0,
      orders: [],
    };

    current.total = round2(current.total + amount);
    current.orders.push({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      amount,
    });
    grouped.set(row.courierId, current);
  }

  const couriers = Array.from(grouped.values()).sort((a, b) => b.total - a.total || a.courierName.localeCompare(b.courierName));
  return {
    total: round2(couriers.reduce((sum, courier) => sum + courier.total, 0)),
    courierCount: couriers.length,
    couriers,
  };
}

export async function getPendingCourierCashSummary(): Promise<PendingCashSummary> {
  const earnings = await prisma.courierEarning.findMany({
    where: {
      settledAt: null,
      kind: "DELIVERY",
      order: { paymentMethod: "CASH" },
    },
    include: {
      courier: { include: { user: true } },
      order: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return cashSummaryFromRows(
    earnings.map((earning) => ({
      courierId: earning.courierId,
      courierName: earning.courier.user.name,
      orderId: earning.order?.id ?? null,
      orderNumber: earning.order?.orderNumber ?? null,
      orderTotal: earning.order?.total ?? null,
      amountTendered: earning.order?.amountTendered ?? null,
      paymentMethod: earning.order?.paymentMethod ?? null,
      kind: earning.kind,
      settledAt: earning.settledAt,
    })),
  );
}
