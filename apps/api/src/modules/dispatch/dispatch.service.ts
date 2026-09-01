import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { haversineKm } from "../../utils/geo.js";
import { getIO, rooms } from "../../sockets/io.js";
import { Role } from "@yummix/types";
import { chooseCourierCandidate, shouldEscalateDispatch } from "./dispatch.policy.js";
import { badRequest, notFound } from "../../utils/AppError.js";

/**
 * Nearest-available-courier selection, generalizing the legacy Yummix's
 * `assignRiderToOrder` (see PROJECT_ANALYSIS.md §4). Couriers already
 * offered this order (however it resolved) are excluded so a rejection or
 * timeout always moves on to a genuinely different candidate instead of
 * re-offering the same one in a loop.
 */
export async function findNearestAvailableCourier(restaurantId: string, excludeCourierIds: string[]) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return null;

  const now = new Date();
  const locationCutoff = new Date(now.getTime() - env.COURIER_LOCATION_MAX_AGE_SECONDS * 1000);
  const candidates = await prisma.courier.findMany({
    where: {
      status: "AVAILABLE",
      verificationStatus: "APPROVED",
      lat: { not: null },
      lng: { not: null },
      locationUpdatedAt: { gte: locationCutoff },
      id: { notIn: excludeCourierIds },
    },
  });
  if (candidates.length === 0) return null;

  const fairnessCutoff = new Date(now.getTime() - env.DISPATCH_FAIRNESS_WINDOW_MINUTES * 60_000);
  const recentOffers = await prisma.courierAssignment.findMany({
    where: { courierId: { in: candidates.map((candidate) => candidate.id) }, offeredAt: { gte: fairnessCutoff } },
    select: { courierId: true, offeredAt: true },
    orderBy: { offeredAt: "desc" },
  });

  const offerStats = new Map<string, { count: number; lastOfferedAt: Date | null }>();
  for (const offer of recentOffers) {
    const current = offerStats.get(offer.courierId) ?? { count: 0, lastOfferedAt: null };
    current.count += 1;
    if (!current.lastOfferedAt || offer.offeredAt > current.lastOfferedAt) current.lastOfferedAt = offer.offeredAt;
    offerStats.set(offer.courierId, current);
  }

  const selected = chooseCourierCandidate(
    { lat: restaurant.lat, lng: restaurant.lng },
    candidates.map((candidate) => ({
      id: candidate.id,
      lat: candidate.lat,
      lng: candidate.lng,
      locationUpdatedAt: candidate.locationUpdatedAt,
      recentOfferCount: offerStats.get(candidate.id)?.count ?? 0,
      lastOfferedAt: offerStats.get(candidate.id)?.lastOfferedAt ?? null,
    })),
    now,
    env.COURIER_LOCATION_MAX_AGE_SECONDS,
  );

  return selected ? candidates.find((candidate) => candidate.id === selected.id) ?? null : null;
}

/**
 * Attempts to offer the next order in WAITING_FOR_COURIER to the nearest
 * free courier. Called immediately when an order enters that status (for
 * zero-latency dispatch in the common case) and again by the periodic
 * sweep (server.ts) to pick up retries after a rejection/timeout — no
 * Vercel-style cron workaround needed since this API runs as a normal
 * long-lived Node process, unlike the legacy serverless deployment.
 */
const dispatchingOrders = new Set<string>();

export async function tryAssignOrder(orderId: string) {
  // Prevent two sweep ticks / a rejection callback from dispatching the same
  // order concurrently inside the initial single API process. If the API is
  // horizontally scaled later, replace this with a PostgreSQL advisory lock.
  if (dispatchingOrders.has(orderId)) return;
  dispatchingOrders.add(orderId);

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "WAITING_FOR_COURIER") return;
    if (shouldEscalateDispatch(order.assignmentRetryCount, env.MAX_ASSIGNMENT_RETRIES)) return;

    const existingOffer = await prisma.courierAssignment.findFirst({
      where: { orderId, status: "OFFERED", expiresAt: { gt: new Date() } },
    });
    if (existingOffer) return;

    const triedAssignments = await prisma.courierAssignment.findMany({ where: { orderId } });
    const excludeCourierIds = triedAssignments.map((assignment) => assignment.courierId);

    const courier = await findNearestAvailableCourier(order.restaurantId, excludeCourierIds);
    if (!courier) return;

    const expiresAt = new Date(Date.now() + env.ASSIGNMENT_OFFER_TTL_SECONDS * 1000);
    const created = await prisma.$transaction(async (tx) => {
      const courierClaim = await tx.courier.updateMany({
        where: { id: courier.id, status: "AVAILABLE", verificationStatus: "APPROVED" },
        data: { status: "ASSIGNED" },
      });
      if (courierClaim.count !== 1) return false;

      const stillWaiting = await tx.order.count({ where: { id: orderId, status: "WAITING_FOR_COURIER" } });
      const liveOffer = await tx.courierAssignment.count({
        where: { orderId, status: "OFFERED", expiresAt: { gt: new Date() } },
      });
      if (stillWaiting !== 1 || liveOffer > 0) {
        await tx.courier.updateMany({ where: { id: courier.id, status: "ASSIGNED" }, data: { status: "AVAILABLE" } });
        return false;
      }

      await tx.courierAssignment.create({
        data: { orderId, courierId: courier.id, status: "OFFERED", expiresAt },
      });
      return true;
    });

    if (created) getIO()?.to(rooms.courier(courier.userId)).emit("assignment:offered", { orderId });
  } finally {
    dispatchingOrders.delete(orderId);
  }
}

/**
 * Periodic sweep: frees couriers whose offer expired unanswered and retries
 * assignment for still-waiting orders. Once the configured retry cap is
 * exhausted, the order stays WAITING_FOR_COURIER and Gestão receives an
 * escalation instead of the system cancelling prepared food automatically.
 */
export async function runDispatchSweep() {
  const now = new Date();

  const expired = await prisma.courierAssignment.findMany({
    where: { status: "OFFERED", expiresAt: { lt: now } },
  });
  for (const assignment of expired) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.courierAssignment.updateMany({
        where: { id: assignment.id, status: "OFFERED", expiresAt: { lt: now } },
        data: { status: "EXPIRED", respondedAt: now },
      });
      if (claimed.count !== 1) return;

      await tx.courier.updateMany({
        where: { id: assignment.courierId, status: "ASSIGNED" },
        data: { status: "AVAILABLE" },
      });
      await tx.order.updateMany({
        where: { id: assignment.orderId, status: "WAITING_FOR_COURIER" },
        data: { assignmentRetryCount: { increment: 1 } },
      });
    });
  }

  const waiting = await prisma.order.findMany({ where: { status: "WAITING_FOR_COURIER" } });
  for (const order of waiting) {
    if (shouldEscalateDispatch(order.assignmentRetryCount, env.MAX_ASSIGNMENT_RETRIES)) {
      const existingAlert = await prisma.adminAlert.findFirst({
        where: { orderId: order.id, type: "ASSIGNMENT_EXHAUSTED", resolved: false },
      });
      if (!existingAlert) {
        await prisma.adminAlert.create({
          data: {
            orderId: order.id,
            type: "ASSIGNMENT_EXHAUSTED",
            message: "Nenhum estafeta aceitou após o limite de tentativas. É necessária atribuição manual.",
          },
        });
        getIO()?.to(rooms.restaurant(order.restaurantId)).emit("dispatch:attention", {
          orderId: order.id,
          reason: "ASSIGNMENT_EXHAUSTED",
        });
      }
      // Never auto-cancel a prepared order just because dispatch exhausted.
      // Keep it waiting so Gestão can assign a courier manually.
      continue;
    }
    await tryAssignOrder(order.id);
  }
}

class DispatchClaimConflict extends Error {}

export async function acceptAssignment(courierId: string, assignmentId: string) {
  const assignment = await prisma.courierAssignment.findFirst({ where: { id: assignmentId, courierId } });
  if (!assignment) return null;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const assignmentClaim = await tx.courierAssignment.updateMany({
        where: { id: assignmentId, courierId, status: "OFFERED", expiresAt: { gt: now } },
        data: { status: "ACCEPTED", respondedAt: now },
      });
      if (assignmentClaim.count !== 1) throw new DispatchClaimConflict();

      const courierClaim = await tx.courier.updateMany({
        where: { id: courierId, status: "ASSIGNED" },
        data: { status: "ASSIGNED" },
      });
      if (courierClaim.count !== 1) throw new DispatchClaimConflict();

      const orderClaim = await tx.order.updateMany({
        where: { id: assignment.orderId, status: "WAITING_FOR_COURIER", courierId: null },
        data: { status: "COURIER_ASSIGNED", courierId },
      });
      if (orderClaim.count !== 1) throw new DispatchClaimConflict();

      await tx.orderStatusEvent.create({
        data: { orderId: assignment.orderId, status: "COURIER_ASSIGNED", actor: Role.COURIER },
      });
      return tx.order.findUnique({ where: { id: assignment.orderId } });
    });

    if (!order) return null;
    getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status: "COURIER_ASSIGNED" });
    getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "COURIER_ASSIGNED" });
    return order;
  } catch (error) {
    if (error instanceof DispatchClaimConflict) return null;
    throw error;
  }
}

// Every currently-online courier with a distance from the restaurant, for
// the "reatribuir manualmente" screen — lets the restaurant see who's too
// far away before picking, instead of trusting the nearest-first algorithm
// blindly.
export async function listNearbyCouriers(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw notFound("Restaurant not found");

  const locationCutoff = new Date(Date.now() - env.COURIER_LOCATION_MAX_AGE_SECONDS * 1000);
  const couriers = await prisma.courier.findMany({
    where: {
      status: "AVAILABLE",
      verificationStatus: "APPROVED",
      lat: { not: null },
      lng: { not: null },
      locationUpdatedAt: { gte: locationCutoff },
    },
    include: { user: true },
  });

  return couriers
    .map((c) => ({
      id: c.id,
      name: c.user.name,
      vehicleType: c.vehicleType,
      distanceKm: Math.round(haversineKm(restaurant.lat, restaurant.lng, c.lat!, c.lng!) * 10) / 10,
      tooFar: haversineKm(restaurant.lat, restaurant.lng, c.lat!, c.lng!) > restaurant.deliveryRadiusKm,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Restaurant picks a specific courier directly, bypassing the offer/accept
 * flow — this is a manual override, so consent is implicit in the
 * restaurant's action instead of requiring the courier to accept an offer.
 * Frees whoever was previously holding the order (if anyone).
 */
export async function forceReassignCourier(restaurantId: string, orderId: string, newCourierId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
  if (!order) throw notFound("Order not found");
  if (!["WAITING_FOR_COURIER", "COURIER_ASSIGNED"].includes(order.status)) {
    throw badRequest("Este pedido não está à espera de estafeta", "NOT_AWAITING_COURIER");
  }

  const newCourier = await prisma.courier.findUnique({ where: { id: newCourierId } });
  if (!newCourier || newCourier.status !== "AVAILABLE" || newCourier.verificationStatus !== "APPROVED") {
    throw badRequest("Este estafeta já não está disponível", "COURIER_UNAVAILABLE");
  }

  await prisma.$transaction([
    ...(order.courierId
      ? [prisma.courier.update({ where: { id: order.courierId }, data: { status: "AVAILABLE" as const } })]
      : []),
    prisma.courierAssignment.updateMany({
      where: { orderId, status: "OFFERED" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    }),
    prisma.courier.update({ where: { id: newCourierId }, data: { status: "ASSIGNED" } }),
    prisma.courierAssignment.create({
      data: {
        orderId,
        courierId: newCourierId,
        status: "ACCEPTED",
        respondedAt: new Date(),
        expiresAt: new Date(),
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: "COURIER_ASSIGNED",
        courierId: newCourierId,
        statusHistory: { create: { status: "COURIER_ASSIGNED", actor: Role.RESTAURANT_OWNER } },
      },
    }),
  ]);

  getIO()?.to(rooms.courier(newCourier.userId)).emit("assignment:offered", { orderId });
  getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId, status: "COURIER_ASSIGNED" });
  getIO()?.to(rooms.restaurant(restaurantId)).emit("order:status", { orderId, status: "COURIER_ASSIGNED" });
}

export async function rejectAssignment(courierId: string, assignmentId: string) {
  const assignment = await prisma.courierAssignment.findFirst({ where: { id: assignmentId, courierId } });
  if (!assignment) return false;

  const rejected = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.courierAssignment.updateMany({
      where: { id: assignmentId, courierId, status: "OFFERED", expiresAt: { gt: now } },
      data: { status: "REJECTED", respondedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.courier.updateMany({ where: { id: courierId, status: "ASSIGNED" }, data: { status: "AVAILABLE" } });
    await tx.order.updateMany({
      where: { id: assignment.orderId, status: "WAITING_FOR_COURIER" },
      data: { assignmentRetryCount: { increment: 1 } },
    });
    return true;
  });

  if (rejected) await tryAssignOrder(assignment.orderId);
  return rejected;
}
