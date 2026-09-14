import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const API = "https://vaipizza-api-staging.onrender.com/api";
const password = "Qa12345!";
const tag = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const lat = 65.0123;
const lng = -20.0456;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = "GET", token, body, expected = 200 } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (response.status !== expected) {
    throw new Error(`${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  }
  return data;
}

async function login(kind, email) {
  const data = await request(`/auth/${kind}/login`, {
    method: "POST",
    body: { email, password },
  });
  assert(data?.accessToken, `No access token for ${kind}`);
  return data.accessToken;
}

async function poll(fn, predicate, label, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

let restaurant = null;
let owner = null;
let kitchen = null;
let customer = null;
let courierUser = null;
let courier = null;

try {
  const passwordHash = await bcrypt.hash(password, 10);
  restaurant = await prisma.restaurant.create({
    data: {
      name: `QA Restaurant ${tag}`,
      slug: `qa-${tag}`,
      status: "APPROVED",
      email: `${tag}@restaurant.test`,
      phone: "+351900000001",
      mbwayPhone: "+351911111111",
      address: "QA remote staging point",
      lat,
      lng,
      deliveryRadiusKm: 8,
      courierDispatchRadiusKm: 12,
      deliveryFeeMode: "BASE_PLUS_PER_KM",
      deliveryFeeBase: 0,
      deliveryFeePerKm: 0,
      deliveryFeeFreeKm: 8,
      commissionPercent: 0,
      acceptsPickup: true,
      acceptsDelivery: true,
      defaultPrepTimeMinutes: 10,
    },
  });

  owner = await prisma.user.create({
    data: {
      email: `${tag}-owner@vaipizza.test`,
      passwordHash,
      name: "QA Owner",
      phone: "+351900000002",
      role: "RESTAURANT_OWNER",
      restaurantId: restaurant.id,
    },
  });
  kitchen = await prisma.user.create({
    data: {
      email: `${tag}-kitchen@vaipizza.test`,
      passwordHash,
      name: "QA Kitchen",
      phone: "+351900000003",
      role: "KITCHEN",
      restaurantId: restaurant.id,
    },
  });
  customer = await prisma.user.create({
    data: {
      email: `${tag}-customer@vaipizza.test`,
      passwordHash,
      name: "QA Customer",
      phone: "+351900000004",
      role: "CUSTOMER",
    },
  });
  courierUser = await prisma.user.create({
    data: {
      email: `${tag}-courier@vaipizza.test`,
      passwordHash,
      name: "QA Courier",
      phone: "+351900000005",
      role: "COURIER",
    },
  });
  courier = await prisma.courier.create({
    data: {
      userId: courierUser.id,
      vehicleType: "BIKE",
      vehicleNumber: `QA-${tag.slice(-6)}`,
      verificationStatus: "APPROVED",
      status: "OFFLINE",
      lat,
      lng,
      locationUpdatedAt: new Date(),
      locationAccuracyM: 5,
    },
  });

  const ownerToken = await login("restaurant", owner.email);
  const kitchenToken = await login("kitchen", kitchen.email);
  const customerToken = await login("customer", customer.email);
  const courierToken = await login("courier", courierUser.email);

  const settings = await request("/restaurant/settings", { token: ownerToken });
  assert(settings?.restaurant?.mbwayPhone === "+351911111111", "MB WAY number missing from live settings");

  await request("/courier/location", {
    method: "POST",
    token: courierToken,
    body: { lat, lng, accuracyM: 5 },
  });
  const online = await request("/courier/online", {
    method: "POST",
    token: courierToken,
    body: { online: true },
  });
  assert(online?.courier?.status === "AVAILABLE", "Courier did not become AVAILABLE");

  // MB WAY + pickup: pending payment must block acceptance.
  const mbwayOrder = await prisma.order.create({
    data: {
      userId: customer.id,
      restaurantId: restaurant.id,
      fulfillmentType: "PICKUP",
      status: "NEW",
      subtotal: 10,
      discount: 0,
      deliveryFee: 0,
      total: 10,
      paymentMethod: "MBWAY",
      paymentStatus: "PENDING",
      statusHistory: { create: { status: "NEW" } },
    },
  });

  const blocked = await request(`/restaurant/orders/${mbwayOrder.id}/status`, {
    method: "PATCH",
    token: ownerToken,
    body: { status: "ACCEPTED" },
    expected: 400,
  });
  assert(
    blocked?.code === "PAYMENT_PENDING" || String(blocked?.message ?? "").includes("MB WAY"),
    "Pending MB WAY order was not blocked with the expected error",
  );

  const paid = await request(`/restaurant/orders/${mbwayOrder.id}/confirm-mbway-payment`, {
    method: "POST",
    token: ownerToken,
  });
  assert(paid?.order?.paymentStatus === "PAID", "MB WAY confirmation did not mark order PAID");

  const accepted = await request(`/restaurant/orders/${mbwayOrder.id}/status`, {
    method: "PATCH",
    token: ownerToken,
    body: { status: "ACCEPTED" },
  });
  assert(accepted?.order?.status === "PREPARING", "Paid MB WAY order did not enter PREPARING");

  const readyPickup = await request(`/restaurant/orders/${mbwayOrder.id}/status`, {
    method: "PATCH",
    token: kitchenToken,
    body: { status: "READY_FOR_PICKUP" },
  });
  assert(readyPickup?.order?.status === "READY_FOR_PICKUP", "Pickup order did not stay READY_FOR_PICKUP");

  const customerView = await request(`/orders/${mbwayOrder.id}`, { token: customerToken });
  assert(customerView?.order?.status === "READY_FOR_PICKUP", "Customer did not see READY_FOR_PICKUP");
  assert(customerView?.order?.restaurant?.mbwayPhone === "+351911111111", "Customer order payload missing MB WAY number");

  const collected = await request(`/restaurant/orders/${mbwayOrder.id}/status`, {
    method: "PATCH",
    token: ownerToken,
    body: { status: "COLLECTED" },
  });
  assert(collected?.order?.status === "COLLECTED", "Pickup order was not marked COLLECTED");

  // Queue: one active delivery + one reserved next delivery.
  const first = await prisma.order.create({
    data: {
      userId: customer.id,
      restaurantId: restaurant.id,
      fulfillmentType: "DELIVERY",
      customerLat: lat + 0.001,
      customerLng: lng + 0.001,
      status: "PREPARING",
      subtotal: 10,
      discount: 0,
      deliveryFee: 2,
      total: 12,
      paymentMethod: "CASH",
      paymentStatus: "PENDING",
      statusHistory: { create: { status: "PREPARING", actor: "KITCHEN" } },
    },
  });

  const firstReady = await request(`/restaurant/orders/${first.id}/status`, {
    method: "PATCH",
    token: kitchenToken,
    body: { status: "READY_FOR_PICKUP" },
  });
  assert(firstReady?.order?.status === "WAITING_FOR_COURIER", "Delivery order did not enter WAITING_FOR_COURIER");

  const firstOffer = await poll(
    () => request("/courier/assignments/current", { token: courierToken }),
    (data) => data?.assignment?.orderId === first.id,
    "first courier offer",
  );
  assert(firstOffer.assignment.isQueued === false, "First offer was incorrectly queued");

  const firstAccepted = await request(`/courier/assignments/${firstOffer.assignment.id}/accept`, {
    method: "POST",
    token: courierToken,
  });
  assert(firstAccepted?.order?.status === "COURIER_ASSIGNED", "First delivery was not assigned");

  const currentFirst = await request("/courier/orders/current", { token: courierToken });
  assert(currentFirst?.order?.id === first.id, "Courier current order is not the first delivery");

  const second = await prisma.order.create({
    data: {
      userId: customer.id,
      restaurantId: restaurant.id,
      fulfillmentType: "DELIVERY",
      customerLat: lat + 0.002,
      customerLng: lng + 0.002,
      status: "PREPARING",
      subtotal: 11,
      discount: 0,
      deliveryFee: 2,
      total: 13,
      paymentMethod: "CASH",
      paymentStatus: "PENDING",
      statusHistory: { create: { status: "PREPARING", actor: "KITCHEN" } },
    },
  });

  const secondReady = await request(`/restaurant/orders/${second.id}/status`, {
    method: "PATCH",
    token: kitchenToken,
    body: { status: "READY_FOR_PICKUP" },
  });
  assert(secondReady?.order?.status === "WAITING_FOR_COURIER", "Second delivery did not enter WAITING_FOR_COURIER");

  const queuedOffer = await poll(
    () => request("/courier/assignments/current", { token: courierToken }),
    (data) => data?.assignment?.orderId === second.id,
    "queued courier offer",
  );
  assert(queuedOffer.assignment.isQueued === true, "Second offer was not marked queued");

  const secondAccepted = await request(`/courier/assignments/${queuedOffer.assignment.id}/accept`, {
    method: "POST",
    token: courierToken,
  });
  assert(secondAccepted?.order?.id === second.id, "Queued offer acceptance returned wrong order");
  assert(secondAccepted?.order?.status === "WAITING_FOR_COURIER", "Queued order should remain WAITING_FOR_COURIER until promotion");

  const next = await request("/courier/orders/next", { token: courierToken });
  assert(next?.assignment?.orderId === second.id, "Reserved next order is not visible to courier");
  assert(next?.assignment?.status === "ACCEPTED", "Next reservation is not ACCEPTED");

  const currentStillFirst = await request("/courier/orders/current", { token: courierToken });
  assert(currentStillFirst?.order?.id === first.id, "Accepting next order replaced current delivery too early");

  await request(`/courier/orders/${first.id}/status`, {
    method: "PATCH",
    token: courierToken,
    body: { status: "PICKED_UP" },
  });
  await request(`/courier/orders/${first.id}/status`, {
    method: "PATCH",
    token: courierToken,
    body: { status: "OUT_FOR_DELIVERY" },
  });
  const delivered = await request(`/courier/orders/${first.id}/status`, {
    method: "PATCH",
    token: courierToken,
    body: { status: "DELIVERED" },
  });
  assert(delivered?.order?.status === "DELIVERED", "First delivery did not complete");

  const promoted = await poll(
    () => request("/courier/orders/current", { token: courierToken }),
    (data) => data?.order?.id === second.id && data?.order?.status === "COURIER_ASSIGNED",
    "promotion of reserved delivery",
  );
  assert(promoted.order.id === second.id, "Reserved delivery was not promoted");

  const nextAfterPromotion = await request("/courier/orders/next", { token: courierToken });
  assert(nextAfterPromotion?.assignment === null, "Next reservation slot was not cleared after promotion");

  const ops = await request("/restaurant/orders/couriers/nearby", { token: ownerToken });
  const row = ops?.couriers?.find((item) => item.id === courier.id);
  assert(row?.activeOrder?.id === second.id, "Gestão feed does not show promoted active order");
  assert(row?.nextOrder === null, "Gestão feed still shows a next order after promotion");

  console.log(JSON.stringify({
    status: "PASS",
    environment: "staging",
    scenarios: [
      "mbway-payment-gate",
      "mbway-confirmation",
      "pickup-ready-customer-visible",
      "pickup-collected",
      "one-active-plus-one-next",
      "queued-offer-acceptance",
      "automatic-promotion-after-delivery",
      "gestao-active-next-feed",
    ],
  }));
} finally {
  if (restaurant?.id) {
    await prisma.order.deleteMany({ where: { restaurantId: restaurant.id } }).catch(() => {});
  }
  if (courierUser?.id) {
    await prisma.user.delete({ where: { id: courierUser.id } }).catch(() => {});
  }
  if (kitchen?.id) {
    await prisma.user.delete({ where: { id: kitchen.id } }).catch(() => {});
  }
  if (owner?.id) {
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => {});
  }
  if (customer?.id) {
    await prisma.user.delete({ where: { id: customer.id } }).catch(() => {});
  }
  if (restaurant?.id) {
    await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});
  }
  await prisma.$disconnect();
}
