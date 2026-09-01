import { Role } from "@yummix/types";
import type { OrderStatus, RestaurantStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { attemptRefund } from "../../services/refund.service.js";
import { getIO, rooms } from "../../sockets/io.js";
import { computeFinancials } from "./financials.js";

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

const CANCELLABLE_BY_ADMIN = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "WAITING_FOR_COURIER",
  "COURIER_ASSIGNED",
];

export async function forceCancelOrder(orderId: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order not found");
  if (!CANCELLABLE_BY_ADMIN.includes(order.status)) {
    throw badRequest("This order can no longer be cancelled", "NOT_CANCELLABLE");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "CANCELLED",
      cancelledBy: Role.SUPER_ADMIN,
      cancelledAt: new Date(),
      rejectionReason: reason,
      statusHistory: { create: { status: "CANCELLED", actor: Role.SUPER_ADMIN } },
    },
  });
  if (order.courierId) {
    await prisma.courier.update({ where: { id: order.courierId }, data: { status: "AVAILABLE" } });
  }
  await attemptRefund(updated, Role.SUPER_ADMIN);

  getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });
  getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });

  return updated;
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
  const approved = await prisma.restaurant.findFirst({ where: { status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  const restaurant = approved ?? (await prisma.restaurant.findFirst({ orderBy: { createdAt: "asc" } }));
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
  return prisma.franchiseLead.update({ where: { id }, data: { status } });
}
