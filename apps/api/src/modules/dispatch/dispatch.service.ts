import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { haversineKm } from "../../utils/geo.js";
import { attemptRefund } from "../../services/refund.service.js";
import { getIO, rooms } from "../../sockets/io.js";
import { Role } from "@yummix/types";

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

  const candidates = await prisma.courier.findMany({
    where: {
      status: "AVAILABLE",
      verificationStatus: "APPROVED",
      lat: { not: null },
      lng: { not: null },
      id: { notIn: excludeCourierIds },
    },
  });
  if (candidates.length === 0) return null;

  let nearest = candidates[0]!;
  let nearestDistance = haversineKm(restaurant.lat, restaurant.lng, nearest.lat!, nearest.lng!);
  for (const c of candidates.slice(1)) {
    const d = haversineKm(restaurant.lat, restaurant.lng, c.lat!, c.lng!);
    if (d < nearestDistance) {
      nearest = c;
      nearestDistance = d;
    }
  }
  return nearest;
}

/**
 * Attempts to offer the next order in WAITING_FOR_COURIER to the nearest
 * free courier. Called immediately when an order enters that status (for
 * zero-latency dispatch in the common case) and again by the periodic
 * sweep (server.ts) to pick up retries after a rejection/timeout — no
 * Vercel-style cron workaround needed since this API runs as a normal
 * long-lived Node process, unlike the legacy serverless deployment.
 */
export async function tryAssignOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "WAITING_FOR_COURIER") return;

  const existingOffer = await prisma.courierAssignment.findFirst({
    where: { orderId, status: "OFFERED" },
  });
  if (existingOffer) return; // already has a live offer out

  const triedAssignments = await prisma.courierAssignment.findMany({ where: { orderId } });
  const excludeCourierIds = triedAssignments.map((a) => a.courierId);

  const courier = await findNearestAvailableCourier(order.restaurantId, excludeCourierIds);
  if (!courier) return; // no one available right now — sweep will retry

  await prisma.$transaction([
    prisma.courier.update({ where: { id: courier.id }, data: { status: "ASSIGNED" } }),
    prisma.courierAssignment.create({
      data: {
        orderId,
        courierId: courier.id,
        status: "OFFERED",
        expiresAt: new Date(Date.now() + env.ASSIGNMENT_OFFER_TTL_SECONDS * 1000),
      },
    }),
  ]);

  getIO()?.to(rooms.courier(courier.userId)).emit("assignment:offered", { orderId });
}

/**
 * Periodic sweep: frees couriers whose offer expired unanswered, retries
 * assignment for still-waiting orders, and auto-cancels (with refund) any
 * order that has exhausted MAX_ASSIGNMENT_RETRIES — mirrors the legacy
 * system's cap so a customer is never left waiting indefinitely.
 */
export async function runDispatchSweep() {
  const now = new Date();

  const expired = await prisma.courierAssignment.findMany({
    where: { status: "OFFERED", expiresAt: { lt: now } },
  });
  for (const assignment of expired) {
    await prisma.$transaction([
      prisma.courierAssignment.update({ where: { id: assignment.id }, data: { status: "EXPIRED", respondedAt: now } }),
      prisma.courier.update({ where: { id: assignment.courierId }, data: { status: "AVAILABLE" } }),
      prisma.order.update({ where: { id: assignment.orderId }, data: { assignmentRetryCount: { increment: 1 } } }),
    ]);
  }

  const waiting = await prisma.order.findMany({ where: { status: "WAITING_FOR_COURIER" } });
  for (const order of waiting) {
    if (order.assignmentRetryCount >= env.MAX_ASSIGNMENT_RETRIES) {
      const cancelled = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          // No human actor — cancelledBy stays null; statusHistory + the
          // AdminAlert below are what record this was a system decision.
          cancelledAt: now,
          statusHistory: { create: { status: "CANCELLED", actor: null } },
        },
      });
      await attemptRefund(cancelled, Role.SUPER_ADMIN);
      await prisma.adminAlert.create({
        data: { orderId: order.id, type: "ASSIGNMENT_EXHAUSTED", message: "No courier found after max retries" },
      });
      getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });
      getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });
      continue;
    }
    await tryAssignOrder(order.id);
  }
}

export async function acceptAssignment(courierId: string, assignmentId: string) {
  const assignment = await prisma.courierAssignment.findFirst({
    where: { id: assignmentId, courierId, status: "OFFERED" },
  });
  if (!assignment || assignment.expiresAt < new Date()) return null;

  const [, order] = await prisma.$transaction([
    prisma.courierAssignment.update({ where: { id: assignment.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    prisma.order.update({
      where: { id: assignment.orderId },
      data: {
        status: "COURIER_ASSIGNED",
        courierId,
        statusHistory: { create: { status: "COURIER_ASSIGNED", actor: Role.COURIER } },
      },
    }),
  ]);

  getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status: "COURIER_ASSIGNED" });
  getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "COURIER_ASSIGNED" });
  return order;
}

export async function rejectAssignment(courierId: string, assignmentId: string) {
  const assignment = await prisma.courierAssignment.findFirst({
    where: { id: assignmentId, courierId, status: "OFFERED" },
  });
  if (!assignment) return;

  await prisma.$transaction([
    prisma.courierAssignment.update({ where: { id: assignment.id }, data: { status: "REJECTED", respondedAt: new Date() } }),
    prisma.courier.update({ where: { id: courierId }, data: { status: "AVAILABLE" } }),
  ]);
  // Best-effort immediate retry so a rejection doesn't wait for the next sweep tick.
  await tryAssignOrder(assignment.orderId);
}
