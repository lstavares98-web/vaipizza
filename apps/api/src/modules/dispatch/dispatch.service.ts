import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { getIO, rooms } from "../../sockets/io.js";
import { Role } from "@yummix/types";
import {
  chooseCourierCandidate,
  evaluateCourierGeoEligibility,
  type CourierGeoEligibilityReason,
} from "./dispatch.policy.js";
import { badRequest, notFound } from "../../utils/AppError.js";

const ACTIVE_DELIVERY_STATUSES = ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;

function restaurantDispatchPoint(restaurant: { lat: number; lng: number; courierDispatchRadiusKm: number }) {
  return {
    lat: restaurant.lat,
    lng: restaurant.lng,
    courierDispatchRadiusKm: restaurant.courierDispatchRadiusKm,
  };
}

function courierCandidate(courier: {
  id: string;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: Date | null;
  locationAccuracyM: number | null;
}, stats?: { count: number; lastOfferedAt: Date | null }) {
  return {
    id: courier.id,
    lat: courier.lat,
    lng: courier.lng,
    locationUpdatedAt: courier.locationUpdatedAt,
    locationAccuracyM: courier.locationAccuracyM,
    recentOfferCount: stats?.count ?? 0,
    lastOfferedAt: stats?.lastOfferedAt ?? null,
  };
}

async function getAvailableGeoEligibleCouriers(restaurantId: string, excludeCourierIds: string[] = []) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return { restaurant: null, couriers: [] as Awaited<ReturnType<typeof prisma.courier.findMany>> };

  const now = new Date();
  const locationCutoff = new Date(now.getTime() - env.COURIER_LOCATION_MAX_AGE_SECONDS * 1000);
  const couriers = await prisma.courier.findMany({
    where: {
      status: "AVAILABLE",
      verificationStatus: "APPROVED",
      lat: { not: null },
      lng: { not: null },
      locationUpdatedAt: { gte: locationCutoff },
      locationAccuracyM: { not: null, lte: env.COURIER_MAX_ACCURACY_METERS },
      ...(excludeCourierIds.length > 0 ? { id: { notIn: excludeCourierIds } } : {}),
    },
  });

  const eligible = couriers.filter((courier) =>
    evaluateCourierGeoEligibility(
      restaurantDispatchPoint(restaurant),
      courierCandidate(courier),
      now,
      env.COURIER_LOCATION_MAX_AGE_SECONDS,
      env.COURIER_MAX_ACCURACY_METERS,
    ).eligible,
  );

  return { restaurant, couriers: eligible };
}

/**
 * Selects an AVAILABLE + APPROVED courier with fresh, accurate GPS inside the
 * restaurant's dedicated courier dispatch radius. Couriers already offered
 * this order are excluded so rejection/timeout always advances to a new
 * candidate rather than looping back to the same person.
 */
export async function findNearestAvailableCourier(restaurantId: string, excludeCourierIds: string[]) {
  const { restaurant, couriers: candidates } = await getAvailableGeoEligibleCouriers(restaurantId, excludeCourierIds);
  if (!restaurant || candidates.length === 0) return null;

  const now = new Date();
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
    restaurantDispatchPoint(restaurant),
    candidates.map((candidate) => courierCandidate(candidate, offerStats.get(candidate.id))),
    now,
    env.COURIER_LOCATION_MAX_AGE_SECONDS,
    env.COURIER_MAX_ACCURACY_METERS,
  );

  return selected ? candidates.find((candidate) => candidate.id === selected.id) ?? null : null;
}

const dispatchingOrders = new Set<string>();

async function ensureAssignmentExhaustedAlert(orderId: string, restaurantId: string) {
  const existingAlert = await prisma.adminAlert.findFirst({
    where: { orderId, type: "ASSIGNMENT_EXHAUSTED", resolved: false },
  });
  if (existingAlert) return;

  await prisma.adminAlert.create({
    data: {
      orderId,
      type: "ASSIGNMENT_EXHAUSTED",
      message: "Todos os estafetas disponíveis e elegíveis já recusaram ou deixaram a oferta expirar. O pedido continua à espera.",
    },
  });
  getIO()?.to(rooms.restaurant(restaurantId)).emit("dispatch:attention", {
    orderId,
    reason: "ASSIGNMENT_EXHAUSTED",
  });
}

async function resolveDispatchAlerts(orderId: string) {
  await prisma.adminAlert.updateMany({
    where: { orderId, type: { in: ["ASSIGNMENT_EXHAUSTED", "NO_ELIGIBLE_COURIER"] }, resolved: false },
    data: { resolved: true, resolvedAt: new Date() },
  });
}

/**
 * Attempts a single exclusive offer for one waiting order. There is no fixed
 * retry cap in V6: the finite candidate set is the limit. Each courier is
 * tried at most once per order; newly-online couriers can still join later.
 */
export async function tryAssignOrder(orderId: string) {
  if (dispatchingOrders.has(orderId)) return;
  dispatchingOrders.add(orderId);

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "WAITING_FOR_COURIER") return;

    const existingOffer = await prisma.courierAssignment.findFirst({
      where: { orderId, status: "OFFERED", expiresAt: { gt: new Date() } },
    });
    if (existingOffer) return;

    const triedAssignments = await prisma.courierAssignment.findMany({
      where: { orderId },
      select: { courierId: true },
    });
    const excludeCourierIds = Array.from(new Set(triedAssignments.map((assignment) => assignment.courierId)));

    const courier = await findNearestAvailableCourier(order.restaurantId, excludeCourierIds);
    if (!courier) {
      // Alert only when there are AVAILABLE couriers in-zone, but all of them
      // have already had their one chance. If everyone is busy/offline/stale,
      // the order simply remains queued until a courier becomes eligible.
      const { couriers: currentlyEligible } = await getAvailableGeoEligibleCouriers(order.restaurantId);
      if (
        currentlyEligible.length > 0 &&
        currentlyEligible.every((candidate) => excludeCourierIds.includes(candidate.id))
      ) {
        await ensureAssignmentExhaustedAlert(order.id, order.restaurantId);
      }
      return;
    }

    const expiresAt = new Date(Date.now() + env.ASSIGNMENT_OFFER_TTL_SECONDS * 1000);
    const created = await prisma.$transaction(async (tx) => {
      const courierClaim = await tx.courier.updateMany({
        where: {
          id: courier.id,
          status: "AVAILABLE",
          verificationStatus: "APPROVED",
          locationUpdatedAt: { gte: new Date(Date.now() - env.COURIER_LOCATION_MAX_AGE_SECONDS * 1000) },
          locationAccuracyM: { not: null, lte: env.COURIER_MAX_ACCURACY_METERS },
        },
        data: { status: "ASSIGNED" },
      });
      if (courierClaim.count !== 1) return false;

      // Re-check geo eligibility inside the claim window. Coordinates may have
      // changed between candidate selection and the transactional reservation.
      const restaurant = await tx.restaurant.findUnique({ where: { id: order.restaurantId } });
      const claimedCourier = await tx.courier.findUnique({ where: { id: courier.id } });
      if (!restaurant || !claimedCourier) return false;
      const eligibility = evaluateCourierGeoEligibility(
        restaurantDispatchPoint(restaurant),
        courierCandidate(claimedCourier),
        new Date(),
        env.COURIER_LOCATION_MAX_AGE_SECONDS,
        env.COURIER_MAX_ACCURACY_METERS,
      );
      if (!eligibility.eligible) {
        await tx.courier.updateMany({ where: { id: courier.id, status: "ASSIGNED" }, data: { status: "AVAILABLE" } });
        return false;
      }

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

/** Oldest waiting order is always considered first. */
export async function dispatchWaitingOrders() {
  const waiting = await prisma.order.findMany({
    where: { status: "WAITING_FOR_COURIER" },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }],
  });
  for (const order of waiting) await tryAssignOrder(order.id);
}

/**
 * Periodic sweep frees unanswered offers. Rejects are retried immediately by
 * rejectAssignment(); expirations are retried at the end of this same sweep.
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

  await dispatchWaitingOrders();
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
        data: { status: "GOING_TO_RESTAURANT" },
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
    await resolveDispatchAlerts(order.id);
    getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status: "COURIER_ASSIGNED" });
    getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "COURIER_ASSIGNED" });
    return order;
  } catch (error) {
    if (error instanceof DispatchClaimConflict) return null;
    throw error;
  }
}

function reasonMessage(reason: CourierGeoEligibilityReason) {
  switch (reason) {
    case "NO_LOCATION": return "Este estafeta ainda não tem uma localização GPS válida";
    case "STALE_LOCATION": return "A localização deste estafeta está desatualizada";
    case "LOW_ACCURACY": return "A localização deste estafeta não tem precisão suficiente";
    case "OUTSIDE_DISPATCH_ZONE": return "Este estafeta está fora da zona operacional";
  }
}

function operationalReason(status: string, geoReasons: CourierGeoEligibilityReason[]) {
  if (status === "OFFLINE") return "OFFLINE";
  if (status === "ASSIGNED") return "OFFER_PENDING";
  if (status !== "AVAILABLE") return "BUSY";
  return geoReasons[0] ?? null;
}

/**
 * Operational courier feed for Gestão. It intentionally includes busy,
 * offline, stale and out-of-zone couriers so the restaurant can understand
 * why somebody is not receiving orders rather than seeing an empty list.
 */
export async function listNearbyCouriers(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw notFound("Restaurant not found");

  const now = new Date();
  const couriers = await prisma.courier.findMany({
    where: { verificationStatus: "APPROVED" },
    include: {
      user: true,
      orders: {
        where: { status: { in: [...ACTIVE_DELIVERY_STATUSES] } },
        select: { id: true, orderNumber: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const rows = couriers.map((courier) => {
    const geo = evaluateCourierGeoEligibility(
      restaurantDispatchPoint(restaurant),
      courierCandidate(courier),
      now,
      env.COURIER_LOCATION_MAX_AGE_SECONDS,
      env.COURIER_MAX_ACCURACY_METERS,
    );
    const eligibleForDispatch = courier.status === "AVAILABLE" && geo.eligible;
    const ageSeconds = courier.locationUpdatedAt
      ? Math.max(0, Math.round((now.getTime() - courier.locationUpdatedAt.getTime()) / 1000))
      : null;

    return {
      id: courier.id,
      name: courier.user.name,
      vehicleType: courier.vehicleType,
      status: courier.status,
      lat: courier.lat,
      lng: courier.lng,
      locationUpdatedAt: courier.locationUpdatedAt,
      locationAgeSeconds: ageSeconds,
      locationAccuracyM: courier.locationAccuracyM,
      distanceKm: geo.distanceKm === null ? null : Math.round(geo.distanceKm * 10) / 10,
      gpsFresh: geo.gpsFresh,
      gpsAccurate: geo.gpsAccurate,
      inDispatchZone: geo.inDispatchZone,
      tooFar: !geo.inDispatchZone && geo.distanceKm !== null,
      eligibleForDispatch,
      ineligibilityReason: eligibleForDispatch ? null : operationalReason(courier.status, geo.reasons),
      activeOrder: courier.orders[0] ?? null,
    };
  });

  rows.sort((a, b) => {
    if (a.eligibleForDispatch !== b.eligibleForDispatch) return a.eligibleForDispatch ? -1 : 1;
    if (a.distanceKm === null && b.distanceKm !== null) return 1;
    if (a.distanceKm !== null && b.distanceKm === null) return -1;
    return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
  });

  return {
    restaurant: {
      lat: restaurant.lat,
      lng: restaurant.lng,
      courierDispatchRadiusKm: restaurant.courierDispatchRadiusKm,
    },
    couriers: rows,
  };
}

/** Restaurant manual override, still constrained by the same safety policy. */
export async function forceReassignCourier(restaurantId: string, orderId: string, newCourierId: string) {
  const [order, restaurant, newCourier] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, restaurantId } }),
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.courier.findUnique({ where: { id: newCourierId } }),
  ]);
  if (!order) throw notFound("Order not found");
  if (!restaurant) throw notFound("Restaurant not found");
  if (!["WAITING_FOR_COURIER", "COURIER_ASSIGNED"].includes(order.status)) {
    throw badRequest("Este pedido não está à espera de estafeta", "NOT_AWAITING_COURIER");
  }
  if (!newCourier || newCourier.status !== "AVAILABLE" || newCourier.verificationStatus !== "APPROVED") {
    throw badRequest("Este estafeta já não está disponível", "COURIER_UNAVAILABLE");
  }

  const eligibility = evaluateCourierGeoEligibility(
    restaurantDispatchPoint(restaurant),
    courierCandidate(newCourier),
    new Date(),
    env.COURIER_LOCATION_MAX_AGE_SECONDS,
    env.COURIER_MAX_ACCURACY_METERS,
  );
  if (!eligibility.eligible) {
    const reason = eligibility.reasons[0]!;
    throw badRequest(reasonMessage(reason), `COURIER_${reason}`);
  }

  const activeAssignments = await prisma.courierAssignment.findMany({
    where: { orderId, status: { in: ["OFFERED", "ACCEPTED"] } },
    include: { courier: { select: { id: true, userId: true } } },
  });
  const displacedCouriers = Array.from(
    new Map(
      activeAssignments
        .map((assignment) => assignment.courier)
        .filter((courier) => courier.id !== newCourierId)
        .map((courier) => [courier.id, courier]),
    ).values(),
  );

  await prisma.$transaction(async (tx) => {
    if (displacedCouriers.length > 0) {
      await tx.courier.updateMany({
        where: { id: { in: displacedCouriers.map((courier) => courier.id) } },
        data: { status: "AVAILABLE" },
      });
    }
    await tx.courierAssignment.updateMany({
      where: { orderId, status: { in: ["OFFERED", "ACCEPTED"] } },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    await tx.courier.update({ where: { id: newCourierId }, data: { status: "GOING_TO_RESTAURANT" } });
    await tx.courierAssignment.create({
      data: {
        orderId,
        courierId: newCourierId,
        status: "ACCEPTED",
        respondedAt: new Date(),
        expiresAt: new Date(),
      },
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "COURIER_ASSIGNED",
        courierId: newCourierId,
        statusHistory: { create: { status: "COURIER_ASSIGNED", actor: Role.RESTAURANT_OWNER } },
      },
    });
  });

  await resolveDispatchAlerts(orderId);
  for (const displacedCourier of displacedCouriers) {
    getIO()?.to(rooms.courier(displacedCourier.userId)).emit("assignment:cancelled", { orderId });
  }
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
