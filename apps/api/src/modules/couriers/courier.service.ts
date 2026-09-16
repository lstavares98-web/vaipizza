import { Role } from "@yummix/types";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { assertTransitionAllowed } from "../orders/orderStateMachine.js";
import { getIO, rooms } from "../../sockets/io.js";
import { computeDeliveryEarning } from "./earnings.js";
import { cashHeldByCourier } from "./cash.js";
import { round2 } from "../../utils/pricing.js";
import { isAccurateCourierLocation, isFreshCourierLocation } from "../dispatch/dispatch.policy.js";
import { dispatchWaitingOrders } from "../dispatch/dispatch.service.js";

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
  if (courier.operationalState === "SUSPENDED") {
    throw badRequest("A sua conta está temporariamente suspensa", "COURIER_SUSPENDED");
  }
  if (courier.operationalState === "DEACTIVATED") {
    throw badRequest("A sua conta está desativada", "COURIER_DEACTIVATED");
  }

  if (!online) {
    if (!["OFFLINE", "AVAILABLE"].includes(courier.status)) {
      throw badRequest("Não pode ficar offline a meio de uma entrega", "COURIER_MID_DELIVERY");
    }
    return prisma.courier.update({ where: { userId }, data: { status: "OFFLINE" } });
  }

  if (courier.status !== "OFFLINE" && courier.status !== "AVAILABLE") {
    throw badRequest("Já existe uma oferta ou entrega ativa", "COURIER_ALREADY_WORKING");
  }
  if (courier.lat === null || courier.lng === null) {
    throw badRequest("Ative a localização precisa antes de ficar online", "COURIER_LOCATION_REQUIRED");
  }
  if (!isFreshCourierLocation(courier.locationUpdatedAt, new Date(), env.COURIER_LOCATION_MAX_AGE_SECONDS)) {
    throw badRequest("A localização está desatualizada. Volte a permitir o GPS e tente novamente", "COURIER_LOCATION_STALE");
  }
  if (!isAccurateCourierLocation(courier.locationAccuracyM, env.COURIER_MAX_ACCURACY_METERS)) {
    throw badRequest(
      `A precisão do GPS precisa de ser melhor que ${env.COURIER_MAX_ACCURACY_METERS} m para ficar online`,
      "COURIER_LOCATION_INACCURATE",
    );
  }

  await prisma.courier.update({ where: { userId }, data: { status: "AVAILABLE" } });
  // A courier becoming available should wake the oldest waiting order now,
  // not wait for the next 15-second sweep.
  await dispatchWaitingOrders();
  return getCourierByUserId(userId);
}

export async function updateLocation(userId: string, lat: number, lng: number, accuracyM: number) {
  return prisma.courier.update({
    where: { userId },
    data: { lat, lng, locationAccuracyM: accuracyM, locationUpdatedAt: new Date() },
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

/**
 * Returns the courier's single future slot. OFFERED means they still need to
 * answer it; ACCEPTED means it is already reserved and will be promoted as
 * soon as the active delivery is completed.
 */
export async function getNextReservedOrder(userId: string) {
  const courier = await getCourierByUserId(userId);
  const now = new Date();
  return prisma.courierAssignment.findFirst({
    where: {
      courierId: courier.id,
      isQueued: true,
      order: { status: "WAITING_FOR_COURIER", courierId: null },
      OR: [
        { status: "ACCEPTED" },
        { status: "OFFERED", expiresAt: { gt: now } },
      ],
    },
    include: { order: { include: { restaurant: true, address: true, items: true } } },
    orderBy: { offeredAt: "asc" },
  });
}

export async function updateDeliveryStatus(
  userId: string,
  orderId: string,
  status: "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED",
) {
  const courier = await getCourierByUserId(userId);
  const order = await prisma.order.findFirst({ where: { id: orderId, courierId: courier.id } });
  if (!order) throw notFound("Order not found");

  assertTransitionAllowed(order.status, status, Role.COURIER);

  if (status === "DELIVERED") {
    const earning = computeDeliveryEarning(order.deliveryFee, courier.lifetimeDeliveries);
    const deliveredAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Claim the transition atomically. Concurrent DELIVERED requests may
      // both have read OUT_FOR_DELIVERY above, but only one can change that
      // exact state. The loser exits before any financial side effect.
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          courierId: courier.id,
          status: "OUT_FOR_DELIVERY",
        },
        data: {
          status: "DELIVERED",
          deliveredAt,
          ...(order.paymentMethod === "CASH" ? { paymentStatus: "PAID" } : {}),
        },
      });

      if (claimed.count !== 1) {
        throw badRequest("O estado do pedido já foi atualizado", "ORDER_STATUS_CONFLICT");
      }

      await tx.orderStatusEvent.create({
        data: { orderId: order.id, status: "DELIVERED", actor: Role.COURIER },
      });

      await tx.courierEarning.create({
        data: { courierId: courier.id, orderId: order.id, amount: earning.base, kind: "DELIVERY" },
      });
      if (earning.bonus > 0) {
        await tx.courierEarning.create({
          data: { courierId: courier.id, amount: earning.bonus, kind: "BONUS" },
        });
      }

      // Promotion happens before the transaction commits. Other dispatch
      // workers therefore never see this courier as AVAILABLE between jobs.
      const reservation = await tx.courierAssignment.findFirst({
        where: { courierId: courier.id, isQueued: true, status: "ACCEPTED" },
        orderBy: { respondedAt: "asc" },
      });

      let promotedOrder = null;
      if (reservation) {
        const nextClaim = await tx.order.updateMany({
          where: { id: reservation.orderId, status: "WAITING_FOR_COURIER", courierId: null },
          data: { status: "COURIER_ASSIGNED", courierId: courier.id },
        });

        if (nextClaim.count === 1) {
          await tx.courierAssignment.update({
            where: { id: reservation.id },
            data: { isQueued: false },
          });
          await tx.orderStatusEvent.create({
            data: { orderId: reservation.orderId, status: "COURIER_ASSIGNED", actor: Role.COURIER },
          });
          promotedOrder = await tx.order.findUnique({ where: { id: reservation.orderId } });
        } else {
          // The reservation became stale (e.g. the order was cancelled).
          await tx.courierAssignment.updateMany({
            where: { id: reservation.id, isQueued: true, status: "ACCEPTED" },
            data: { status: "CANCELLED", respondedAt: new Date() },
          });
        }
      }

      if (!promotedOrder) {
        // If a queued offer was still unanswered when this delivery ended,
        // cancel the queued form. The dispatcher will immediately offer the
        // waiting order again using normal free-courier priority.
        await tx.courierAssignment.updateMany({
          where: { courierId: courier.id, isQueued: true, status: "OFFERED" },
          data: { status: "CANCELLED", respondedAt: new Date() },
        });
      }

      await tx.courier.update({
        where: { id: courier.id },
        data: {
          status: promotedOrder ? "GOING_TO_RESTAURANT" : "AVAILABLE",
          totalEarnings: { increment: earning.total },
          lifetimeDeliveries: { increment: 1 },
        },
      });

      const finalOrder = await tx.order.findUnique({ where: { id: order.id } });
      if (!finalOrder) throw notFound("Order not found");
      return { finalOrder, promotedOrder };
    });

    getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status });
    getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status });

    if (result.promotedOrder) {
      getIO()?.to(rooms.courier(courier.userId)).emit("assignment:promoted", { orderId: result.promotedOrder.id });
      getIO()?.to(rooms.restaurant(result.promotedOrder.restaurantId)).emit("order:status", {
        orderId: result.promotedOrder.id,
        status: "COURIER_ASSIGNED",
      });
      getIO()?.to(rooms.customer(result.promotedOrder.userId)).emit("order:status", {
        orderId: result.promotedOrder.id,
        status: "COURIER_ASSIGNED",
      });
    }

    // Whether a reservation was promoted or a free slot opened, run the
    // queue now. After promotion this can fill the courier's newly-free
    // "next" slot; without promotion it can use the courier normally.
    await dispatchWaitingOrders();
    return result.finalOrder;
  }

  // Change (if any) was already worked out at checkout from what the
  // customer declared they'd pay with — the courier just hands it over,
  // nothing to enter here. See orders.service.ts checkout().
  const data: Record<string, unknown> = {
    status,
    statusHistory: { create: { status, actor: Role.COURIER } },
  };
  if (status === "PICKED_UP") data.pickedUpAt = new Date();

  const updated = await prisma.order.update({ where: { id: order.id }, data });

  if (status === "PICKED_UP") {
    await prisma.courier.update({ where: { id: courier.id }, data: { status: "PICKED_UP" } });
  } else if (status === "OUT_FOR_DELIVERY") {
    await prisma.courier.update({ where: { id: courier.id }, data: { status: "DELIVERING" } });
  }

  getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status });
  getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status });

  return updated;
}

export async function getEarningsSummary(userId: string) {
  const courier = await getCourierByUserId(userId);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [recent, todayEarnings, pendingCashEarnings] = await Promise.all([
    prisma.courierEarning.findMany({
      where: { courierId: courier.id, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.courierEarning.findMany({
      where: { courierId: courier.id, kind: "DELIVERY", createdAt: { gte: startOfToday } },
    }),
    prisma.courierEarning.findMany({
      where: { courierId: courier.id, kind: "DELIVERY", settledAt: null, order: { paymentMethod: "CASH" } },
      include: { order: true },
    }),
  ]);

  const byDay = new Map<string, number>();
  for (const e of recent) {
    const key = e.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + e.amount);
  }

  // The courier's cash-in-hand liability is what the customer actually
  // handed over (amountTendered), not the courier's own delivery fee —
  // the restaurant already sent the change out with the courier, so
  // handing the customer their change leaves the courier holding the
  // *whole* note/bill the customer paid with, all of which is owed back
  // to the restaurant (who pays the courier's fee separately).
  const pendingCashTotal = pendingCashEarnings.reduce(
    (sum, e) => sum + (e.order ? cashHeldByCourier(e.order.total, e.order.amountTendered) : 0),
    0,
  );

  return {
    totalEarnings: courier.totalEarnings,
    lifetimeDeliveries: courier.lifetimeDeliveries,
    avgRating: courier.avgRating,
    today: { deliveries: todayEarnings.length, total: round2(todayEarnings.reduce((s, e) => s + e.amount, 0)) },
    pendingCashTotal: round2(pendingCashTotal),
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
