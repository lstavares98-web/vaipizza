import { Role } from "@yummix/types";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { assertTransitionAllowed } from "../orders/orderStateMachine.js";
import { getIO, rooms } from "../../sockets/io.js";
import { computeDeliveryEarning } from "./earnings.js";

export async function getCourierByUserId(userId: string) {
  const courier = await prisma.courier.findUnique({ where: { userId } });
  if (!courier) throw notFound("Courier profile not found");
  return courier;
}

export async function setOnline(userId: string, online: boolean) {
  const courier = await getCourierByUserId(userId);
  if (courier.verificationStatus !== "APPROVED") {
    throw badRequest("A sua conta ainda não foi aprovada", "COURIER_NOT_APPROVED");
  }
  if (!online && !["OFFLINE", "AVAILABLE"].includes(courier.status)) {
    throw badRequest("Não pode ficar offline a meio de uma entrega", "COURIER_MID_DELIVERY");
  }
  return prisma.courier.update({
    where: { userId },
    data: { status: online ? "AVAILABLE" : "OFFLINE" },
  });
}

export async function updateLocation(userId: string, lat: number, lng: number) {
  await prisma.courier.update({
    where: { userId },
    data: { lat, lng, locationUpdatedAt: new Date() },
  });
}

export async function getCurrentAssignment(userId: string) {
  const courier = await getCourierByUserId(userId);
  return prisma.courierAssignment.findFirst({
    where: { courierId: courier.id, status: "OFFERED", expiresAt: { gt: new Date() } },
    include: { order: { include: { restaurant: true, items: true } } },
    orderBy: { offeredAt: "desc" },
  });
}

export async function getCurrentOrder(userId: string) {
  const courier = await getCourierByUserId(userId);
  return prisma.order.findFirst({
    where: { courierId: courier.id, status: { in: ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] } },
    include: { restaurant: true, address: true, items: true, user: true },
  });
}

export async function updateDeliveryStatus(userId: string, orderId: string, status: "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED") {
  const courier = await getCourierByUserId(userId);
  const order = await prisma.order.findFirst({ where: { id: orderId, courierId: courier.id } });
  if (!order) throw notFound("Order not found");

  assertTransitionAllowed(order.status, status, Role.COURIER);

  const data: Record<string, unknown> = {
    status,
    statusHistory: { create: { status, actor: Role.COURIER } },
  };
  if (status === "PICKED_UP") data.pickedUpAt = new Date();
  if (status === "DELIVERED") data.deliveredAt = new Date();

  const updated = await prisma.order.update({ where: { id: order.id }, data });

  if (status === "DELIVERED") {
    const earning = computeDeliveryEarning(order.deliveryFee, courier.lifetimeDeliveries);
    await prisma.$transaction([
      prisma.courierEarning.create({
        data: { courierId: courier.id, orderId: order.id, amount: earning.base, kind: "DELIVERY" },
      }),
      ...(earning.bonus > 0
        ? [prisma.courierEarning.create({ data: { courierId: courier.id, amount: earning.bonus, kind: "BONUS" } })]
        : []),
      prisma.courier.update({
        where: { id: courier.id },
        data: {
          status: "AVAILABLE",
          totalEarnings: { increment: earning.total },
          lifetimeDeliveries: { increment: 1 },
        },
      }),
    ]);
  }

  getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status });
  getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status });

  return updated;
}

export async function getEarningsSummary(userId: string) {
  const courier = await getCourierByUserId(userId);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const recent = await prisma.courierEarning.findMany({
    where: { courierId: courier.id, createdAt: { gte: sevenDaysAgo } },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, number>();
  for (const e of recent) {
    const key = e.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + e.amount);
  }

  return {
    totalEarnings: courier.totalEarnings,
    lifetimeDeliveries: courier.lifetimeDeliveries,
    avgRating: courier.avgRating,
    last7Days: Array.from(byDay.entries()).map(([date, amount]) => ({ date, amount })),
  };
}

export async function getHistory(userId: string) {
  const courier = await getCourierByUserId(userId);
  return prisma.order.findMany({
    where: { courierId: courier.id, status: "DELIVERED" },
    include: { restaurant: true },
    orderBy: { deliveredAt: "desc" },
    take: 50,
  });
}
