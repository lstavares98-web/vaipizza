import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { notFound } from "../../utils/AppError.js";

const ADMIN_TIME_ZONE = "Europe/Lisbon";

export interface AdminOrderFilters {
  status?: OrderStatus;
  restaurantId?: string;
  orderNumber?: number;
  date?: string;
  from?: string;
  to?: string;
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addLocalDays(value: string, days: number) {
  const { year, month, day } = parseDateOnly(value);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
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
  const representedAsUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return representedAsUtc - date.getTime();
}

function localMidnightToUtc(value: string, timeZone = ADMIN_TIME_ZONE) {
  const { year, month, day } = parseDateOnly(value);
  const desiredWallClock = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utcMs = desiredWallClock;

  // Resolve the zone offset iteratively so summer/winter Lisbon offsets and
  // DST boundaries are handled without assuming UTC midnight.
  for (let i = 0; i < 3; i += 1) {
    utcMs = desiredWallClock - timeZoneOffsetMs(new Date(utcMs), timeZone);
  }
  return new Date(utcMs);
}

export function lisbonDayBounds(date: string) {
  return {
    start: localMidnightToUtc(date, ADMIN_TIME_ZONE),
    end: localMidnightToUtc(addLocalDays(date, 1), ADMIN_TIME_ZONE),
  };
}

export function buildAdminOrderWhere(filters: AdminOrderFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.restaurantId) where.restaurantId = filters.restaurantId;
  if (filters.orderNumber !== undefined) where.orderNumber = filters.orderNumber;

  if (filters.date) {
    const { start, end } = lisbonDayBounds(filters.date);
    where.createdAt = { gte: start, lt: end };
  } else if (filters.from || filters.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = lisbonDayBounds(filters.from).start;
    if (filters.to) createdAt.lt = lisbonDayBounds(filters.to).end;
    where.createdAt = createdAt;
  }

  return where;
}

export async function listAdminOrders(filters: AdminOrderFilters) {
  return prisma.order.findMany({
    where: buildAdminOrderWhere(filters),
    include: {
      restaurant: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, phone: true, email: true } },
      courier: { include: { user: { select: { id: true, name: true, phone: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
}

export async function getAdminOrderDetail(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      restaurant: { select: { id: true, name: true, address: true } },
      user: { select: { id: true, name: true, phone: true, email: true } },
      address: true,
      courier: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
      items: {
        include: {
          modifiers: true,
        },
        orderBy: { id: "asc" },
      },
      statusHistory: { orderBy: { createdAt: "asc" } },
      courierAssignments: { orderBy: { offeredAt: "asc" } },
      couponRedemption: { include: { coupon: true } },
      adminAlerts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw notFound("Pedido não encontrado");
  return order;
}
