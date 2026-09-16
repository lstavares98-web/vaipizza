import { prisma } from "../../config/prisma.js";
import { round2 } from "../../utils/pricing.js";
import { cashHeldByCourier } from "../couriers/cash.js";
import { computeFinancials } from "./financials.js";

export type DashboardPeriod = "today" | "7d" | "15d" | "30d";

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

interface AnalyticsItemRow {
  productNameSnapshot: string;
  comboId: string | null;
  quantity: number;
  lineTotal: number;
}

export interface AnalyticsOrderRow {
  status: string;
  createdAt: Date;
  subtotal: number;
  deliveryFee: number;
  total: number;
  fulfillmentType: "DELIVERY" | "PICKUP";
  restaurant: { commissionPercent: number };
  items: AnalyticsItemRow[];
}

function dateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return { year: parts.year!, month: parts.month!, day: parts.day! };
}

function dateKey(date: Date, timeZone: string) {
  const { year, month, day } = dateParts(date, timeZone);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function addDateKeyDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

function zoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const representedAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return representedAsUtc - date.getTime();
}

function localMidnightToUtc(key: string, timeZone: string) {
  const [year, month, day] = key.split("-").map(Number);
  const wallClock = Date.UTC(year!, month! - 1, day!, 0, 0, 0);
  let utc = wallClock;
  for (let index = 0; index < 3; index += 1) {
    utc = wallClock - zoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

export function periodBounds(period: DashboardPeriod, now = new Date(), timeZone = "Europe/Lisbon") {
  const days = period === "today" ? 1 : period === "7d" ? 7 : period === "15d" ? 15 : 30;
  const todayKey = dateKey(now, timeZone);
  const startKey = addDateKeyDays(todayKey, -(days - 1));
  const endKey = addDateKeyDays(todayKey, 1);
  return {
    start: localMidnightToUtc(startKey, timeZone),
    end: localMidnightToUtc(endKey, timeZone),
  };
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

function rankItems(rows: AnalyticsOrderRow[], combo: boolean) {
  const grouped = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of rows) {
    for (const item of order.items) {
      if ((item.comboId !== null) !== combo) continue;
      const current = grouped.get(item.productNameSnapshot) ?? { name: item.productNameSnapshot, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue = round2(current.revenue + item.lineTotal);
      grouped.set(item.productNameSnapshot, current);
    }
  }
  return Array.from(grouped.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, 5);
}

export function aggregateAdminPeriod(rows: AnalyticsOrderRow[], timeZone = "Europe/Lisbon") {
  const counted = rows.filter((order) => order.status !== "CANCELLED");
  const financials = computeFinancials(counted);
  const trendMap = new Map<string, { date: string; orders: number; revenue: number }>();
  const fulfillmentCounts = { DELIVERY: 0, PICKUP: 0 };

  for (const order of counted) {
    const key = dateKey(order.createdAt, timeZone);
    const point = trendMap.get(key) ?? { date: key, orders: 0, revenue: 0 };
    point.orders += 1;
    point.revenue = round2(point.revenue + order.total);
    trendMap.set(key, point);
    fulfillmentCounts[order.fulfillmentType] += 1;
  }

  return {
    ...financials,
    averageTicket: financials.orderCount ? round2(financials.gmv / financials.orderCount) : 0,
    trend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: rankItems(counted, false),
    topCombos: rankItems(counted, true),
    fulfillmentMix: [
      { type: "DELIVERY" as const, count: fulfillmentCounts.DELIVERY },
      { type: "PICKUP" as const, count: fulfillmentCounts.PICKUP },
    ],
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

export async function getAdminPeriodAnalytics(period: DashboardPeriod, now = new Date()) {
  const { start, end } = periodBounds(period, now, "Europe/Lisbon");
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: {
      status: true,
      createdAt: true,
      subtotal: true,
      deliveryFee: true,
      total: true,
      fulfillmentType: true,
      restaurant: { select: { commissionPercent: true } },
      items: {
        select: {
          productNameSnapshot: true,
          comboId: true,
          quantity: true,
          lineTotal: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return aggregateAdminPeriod(orders, "Europe/Lisbon");
}
