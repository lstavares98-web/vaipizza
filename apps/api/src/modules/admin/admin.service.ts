import { Role } from "@yummix/types";
import type { CourierOperationalState, OrderStatus, RestaurantStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { getIO, rooms } from "../../sockets/io.js";
import { computeFinancials } from "./financials.js";
import { cancelOrderBeforeHandoff } from "../orders/cancelOrder.service.js";

// ---- Restaurants ------------------------------------------------------

export async function listRestaurants(status?: RestaurantStatus) {
  return prisma.restaurant.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
  });
}

export async function approveRestaurant(id: string) {
  const restaurant = await prisma.restaurant.update({ where: { id }, data: { status: "APPROVED", rejectionReason: null } });
  return restaurant;
}

export async function rejectRestaurant(id: string, reason: string) {
  return prisma.restaurant.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason } });
}

export async function suspendRestaurant(id: string) {
  return prisma.restaurant.update({ where: { id }, data: { status: "SUSPENDED" } });
}

export async function updateRestaurantSettings(
  id: string,
  input: { commissionPercent?: number; deliveryRadiusKm?: number },
) {
  const existing = await prisma.restaurant.findUnique({ where: { id } });
  if (!existing) throw notFound("Restaurant not found");
  return prisma.restaurant.update({ where: { id }, data: input });
}

// ---- Couriers -----------------------------------------------------------

export async function listCouriers(verificationStatus?: VerificationStatus) {
  return prisma.courier.findMany({
    where: verificationStatus ? { verificationStatus } : {},
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function approveCourier(id: string) {
  return prisma.courier.update({ where: { id }, data: { verificationStatus: "APPROVED" } });
}

export async function rejectCourier(id: string) {
  return prisma.courier.update({ where: { id }, data: { verificationStatus: "REJECTED" } });
}

const ACTIVE_COURIER_ORDER_STATUSES = ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;

export async function setCourierOperationalState(id: string, state: CourierOperationalState) {
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const courier = await tx.courier.findUnique({ where: { id } });
    if (!courier) throw notFound("Courier not found");

    const activeOrder = await tx.order.findFirst({
      where: { courierId: id, status: { in: [...ACTIVE_COURIER_ORDER_STATUSES] } },
      select: { id: true, status: true },
    });
    if (activeOrder) {
      throw badRequest(
        "Resolva ou reatribua a entrega ativa antes de alterar o estado deste estafeta",
        "NOT_ALLOWED_WITH_ACTIVE_DELIVERY",
      );
    }

    if (state === "ACTIVE") {
      return tx.courier.update({
        where: { id },
        data: { operationalState: "ACTIVE", status: "OFFLINE" },
        include: { user: true },
      });
    }

    await tx.courierAssignment.updateMany({
      where: { courierId: id, status: "OFFERED" },
      data: { status: "CANCELLED", respondedAt: now },
    });

    await tx.refreshToken.updateMany({
      where: { userId: courier.userId, revokedAt: null },
      data: { revokedAt: now },
    });

    return tx.courier.update({
      where: { id },
      data: {
        operationalState: state,
        status: "OFFLINE",
        sessionVersion: { increment: 1 },
      },
      include: { user: true },
    });
  });

  if (state !== "ACTIVE") {
    const io = getIO();
    const room = rooms.courier(updated.userId);
    io?.to(room).emit("courier:operational-state", { state });
    io?.in(room).disconnectSockets(true);
  }

  return updated;
}

// ---- Customers ----------------------------------------------------------

export async function listCustomers() {
  return prisma.user.findMany({
    where: { role: Role.CUSTOMER },
    select: { id: true, name: true, email: true, phone: true, isBlocked: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function setCustomerBlocked(id: string, blocked: boolean) {
  const user = await prisma.user.findFirst({ where: { id, role: Role.CUSTOMER } });
  if (!user) throw notFound("Customer not found");
  return prisma.user.update({ where: { id }, data: { isBlocked: blocked } });
}

// ---- Orders ---------------------------------------------------------------

export async function listAllOrders(filters: { status?: OrderStatus; restaurantId?: string }) {
  return prisma.order.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
    },
    include: { restaurant: true, user: true, courier: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function forceCancelOrder(orderId: string, reason: string) {
  const result = await cancelOrderBeforeHandoff({
    orderId,
    actorRole: Role.SUPER_ADMIN,
    reason,
  });
  return result.order;
}

// ---- Refund alerts ----------------------------------------------------

export async function listAdminAlerts(resolved = false) {
  return prisma.adminAlert.findMany({
    where: { resolved },
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function resolveAdminAlert(id: string) {
  return prisma.adminAlert.update({ where: { id }, data: { resolved: true, resolvedAt: new Date() } });
}

// ---- Feedback -----------------------------------------------------------

export async function listFeedback() {
  return prisma.feedbackSubmission.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

// ---- Dashboard / financials --------------------------------------------

export async function getDashboard() {
  const [orders, restaurantCount, customerCount, courierCount, pendingRestaurants, pendingCouriers, unresolvedAlerts] =
    await Promise.all([
      prisma.order.findMany({ include: { restaurant: { select: { commissionPercent: true } } } }),
      prisma.restaurant.count({ where: { status: "APPROVED" } }),
      prisma.user.count({ where: { role: Role.CUSTOMER } }),
      prisma.courier.count({ where: { verificationStatus: "APPROVED" } }),
      prisma.restaurant.count({ where: { status: "PENDING" } }),
      prisma.courier.count({ where: { verificationStatus: "PENDING" } }),
      prisma.adminAlert.count({ where: { resolved: false } }),
    ]);

  const financials = computeFinancials(orders);
  const installation = await prisma.restaurant.findFirst({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, status: true, combosEnabled: true },
  });

  const byDay = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    const key = o.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + o.total);
  }
  const revenueByDay = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, revenue]) => ({ date, revenue }));

  return {
    ...financials,
    restaurantCount,
    customerCount,
    courierCount,
    pendingRestaurants,
    pendingCouriers,
    unresolvedAlerts,
    installation,
    revenueByDay,
  };
}


// ---- Single-installation feature flags ----------------------------------

async function getPrimaryInstallation() {
  const configured = await prisma.restaurant.findUnique({ where: { slug: env.PRIMARY_RESTAURANT_SLUG } });
  if (configured) return configured;

  const approved = await prisma.restaurant.findFirst({ where: { status: "APPROVED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const restaurant = approved ?? (await prisma.restaurant.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }));
  if (!restaurant) throw notFound("Instalação VAIPIZZA não encontrada");
  return restaurant;
}

export async function getInstallationFeatures() {
  const restaurant = await getPrimaryInstallation();
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    combosEnabled: restaurant.combosEnabled,
  };
}

export async function updateInstallationFeatures(input: { combosEnabled?: boolean }) {
  const restaurant = await getPrimaryInstallation();
  const updated = await prisma.restaurant.update({ where: { id: restaurant.id }, data: input });
  return {
    restaurantId: updated.id,
    restaurantName: updated.name,
    combosEnabled: updated.combosEnabled,
  };
}


// ---- Franchise leads ------------------------------------------------------

export async function listFranchiseLeads() {
  return prisma.franchiseLead.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
}

export async function updateFranchiseLeadStatus(id: string, status: "NEW" | "CONTACTED" | "ARCHIVED") {
  const existing = await prisma.franchiseLead.findUnique({ where: { id } });
  if (!existing) throw notFound("Contacto de franquia não encontrado");
  return prisma.franchiseLead.update({ where: { id }, data: input });
}
