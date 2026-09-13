import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest } from "../types.js";
import {
  addQaProductToCart,
  createQaAddress,
  createQaCourierFixture,
  createQaCustomer,
  loginQaCourierSession,
} from "../fixtures.js";
import { qaRequest } from "../http.js";
import { saveManifest } from "../manifest.js";
import { pointAtDistanceKm } from "../scenarios/geo.js";
import { singleDeliveryCheckoutBody } from "../scenarios/singleDelivery.js";
import { auditOrderConsistency } from "./audit.js";
import { createStartBarrier } from "./concurrentCheckout.js";
import { eligibleExternalCourierIds } from "./dispatchModes.js";

export interface DuplicateActionObservation {
  label: string;
  statuses: number[];
  finalStatus: string;
  expectedStatus: string;
}

export interface FinalDeliveryEffects {
  orderStatus: string;
  paymentStatus: string;
  courierStatus: string;
  deliveryEarningCount: number;
  lifetimeDeliveriesDelta: number;
}

export interface DuplicateActionOptions {
  productId: string;
  staffToken: string;
  kitchenToken: string;
  restaurantLat: number;
  restaurantLng: number;
  customerIndex?: number;
  courierIndex?: number;
}

export interface DuplicateActionScenarioResult {
  orderId: string;
  observations: DuplicateActionObservation[];
  finalEffects: FinalDeliveryEffects;
  statusEventCounts: Record<string, number>;
}

export function duplicateActionBlockingExternalCourierIds(
  args: Parameters<typeof eligibleExternalCourierIds>[0],
): string[] {
  return eligibleExternalCourierIds(args);
}

export function validateDuplicateActionObservation(observation: DuplicateActionObservation): void {
  if (observation.statuses.length !== 2) throw new Error(`${observation.label}: expected exactly two duplicate attempts`);
  if (!observation.statuses.some((status) => status >= 200 && status < 300)) {
    throw new Error(`${observation.label}: duplicate pair had no successful request`);
  }
  const serverFailure = observation.statuses.find((status) => status >= 500);
  if (serverFailure !== undefined) throw new Error(`${observation.label}: duplicate pair returned server error ${serverFailure}`);
  const unexpected = observation.statuses.find((status) => !(status >= 200 && status < 300) && !(status >= 400 && status < 500));
  if (unexpected !== undefined) throw new Error(`${observation.label}: duplicate pair returned unexpected HTTP ${unexpected}`);
  if (observation.finalStatus !== observation.expectedStatus) {
    throw new Error(`${observation.label}: final state ${observation.finalStatus} does not match ${observation.expectedStatus}`);
  }
}

export function validateFinalDeliveryEffects(effects: FinalDeliveryEffects): void {
  if (effects.orderStatus !== "DELIVERED") throw new Error(`Final order state is ${effects.orderStatus}, expected DELIVERED`);
  if (effects.paymentStatus !== "PAID") throw new Error(`Final payment state is ${effects.paymentStatus}, expected PAID`);
  if (effects.courierStatus !== "AVAILABLE") throw new Error(`Final courier state is ${effects.courierStatus}, expected AVAILABLE`);
  if (effects.deliveryEarningCount !== 1) {
    throw new Error(`Duplicate delivery earning effect detected: count=${effects.deliveryEarningCount}`);
  }
  if (effects.lifetimeDeliveriesDelta !== 1) {
    throw new Error(`Duplicate lifetime delivery increment detected: delta=${effects.lifetimeDeliveriesDelta}`);
  }
}

async function runDuplicateRequests(
  request: () => Promise<number>,
): Promise<number[]> {
  const barrier = createStartBarrier();
  const pending = [0, 1].map(async () => {
    await barrier.wait();
    return request();
  });
  barrier.release();
  return Promise.all(pending);
}

async function assertNoNonQaEligibleCouriers(prisma: PrismaClient, manifest: QaRunManifest): Promise<void> {
  const restaurantSlug = process.env.PRIMARY_RESTAURANT_SLUG?.trim();
  if (!restaurantSlug) throw new Error("Duplicate-action QA requires PRIMARY_RESTAURANT_SLUG");

  const [couriers, restaurant] = await Promise.all([
    prisma.courier.findMany({
      where: { status: "AVAILABLE" },
      select: {
        id: true,
        status: true,
        lat: true,
        lng: true,
        locationUpdatedAt: true,
        locationAccuracyM: true,
      },
    }),
    prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { lat: true, lng: true, courierDispatchRadiusKm: true },
    }),
  ]);
  if (!restaurant) throw new Error(`Duplicate-action QA restaurant ${restaurantSlug} was not found`);

  const maxLocationAgeSeconds = Number(process.env.COURIER_LOCATION_MAX_AGE_SECONDS ?? 120);
  const maxAccuracyMeters = Number(process.env.COURIER_MAX_ACCURACY_METERS ?? 100);
  const blockingIds = duplicateActionBlockingExternalCourierIds({
    couriers,
    qaCourierIds: manifest.courierIds,
    restaurant,
    now: new Date(),
    maxLocationAgeSeconds,
    maxAccuracyMeters,
  });
  if (blockingIds.length !== 0) {
    throw new Error(`Duplicate-action QA is blocked because ${blockingIds.length} non-QA eligible courier(s) exist`);
  }
}

async function readOrderStatus(prisma: PrismaClient, orderId: string): Promise<string> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new Error(`Duplicate-action QA order ${orderId} disappeared`);
  return order.status;
}

export async function runDuplicateActionScenario(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DuplicateActionOptions,
): Promise<DuplicateActionScenarioResult> {
  const courierPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 0.5, 210);
  const courier = await createQaCourierFixture(prisma, config, manifest, {
    index: options.courierIndex ?? 4_000,
    status: "AVAILABLE",
    lat: courierPoint.lat,
    lng: courierPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const courierSession = await loginQaCourierSession(config, courier.email, courier.password);
  await assertNoNonQaEligibleCouriers(prisma, manifest);

  const courierBefore = await prisma.courier.findUnique({
    where: { id: courier.courierId },
    select: { lifetimeDeliveries: true },
  });
  if (!courierBefore) throw new Error("Duplicate-action QA courier disappeared before test");

  const point = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 210);
  const customer = await createQaCustomer(config, manifest, options.customerIndex ?? 400_000);
  const addressId = await createQaAddress(config, manifest, customer.accessToken, {
    labelSuffix: "duplicate-actions",
    line1: `[QA ${manifest.runId}] duplicate actions`,
    city: "Braga",
    postalCode: "4700-000",
    lat: point.lat,
    lng: point.lng,
    isDefault: true,
  });
  await addQaProductToCart(config, customer.accessToken, options.productId, 1);
  const checkout = await qaRequest<{ success?: boolean; order?: { id?: string; status?: string }; message?: string }>(
    config,
    "/api/orders",
    {
      method: "POST",
      token: customer.accessToken,
      body: { ...singleDeliveryCheckoutBody(addressId, manifest.runId), notes: `[QA ${manifest.runId}] duplicate-actions` },
    },
  );
  const orderId = checkout.data?.order?.id;
  if (!checkout.ok || checkout.data?.success === false || !orderId || checkout.data.order?.status !== "NEW") {
    throw new Error(`Duplicate-action checkout failed: ${checkout.data?.message ?? `HTTP ${checkout.status}`}`);
  }
  manifest.orderIds.push(orderId);
  await saveManifest(manifest);

  const observations: DuplicateActionObservation[] = [];
  const observe = async (label: string, expectedStatus: string, request: () => Promise<number>) => {
    const statuses = await runDuplicateRequests(request);
    const finalStatus = await readOrderStatus(prisma, orderId);
    const observation = { label, statuses, finalStatus, expectedStatus };
    validateDuplicateActionObservation(observation);
    observations.push(observation);
  };

  await observe("restaurant-accept", "PREPARING", async () => {
    const response = await qaRequest<{ success?: boolean; message?: string }>(
      config,
      `/api/restaurant/orders/${orderId}/status`,
      { method: "PATCH", token: options.staffToken, body: { status: "ACCEPTED" } },
    );
    return response.status;
  });

  await observe("kitchen-ready", "WAITING_FOR_COURIER", async () => {
    const response = await qaRequest<{ success?: boolean; message?: string }>(
      config,
      `/api/restaurant/orders/${orderId}/status`,
      { method: "PATCH", token: options.kitchenToken, body: { status: "READY_FOR_PICKUP" } },
    );
    return response.status;
  });

  const assignment = await prisma.courierAssignment.findFirst({
    where: { orderId, courierId: courier.courierId, status: "OFFERED" },
    select: { id: true },
  });
  if (!assignment) throw new Error("Duplicate-action QA dispatch did not create the courier offer");
  await observe("courier-assignment-accept", "COURIER_ASSIGNED", async () => {
    const response = await qaRequest<{ success?: boolean; message?: string }>(
      config,
      `/api/courier/assignments/${assignment.id}/accept`,
      { method: "POST", token: courierSession.accessToken },
    );
    return response.status;
  });

  for (const status of ["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"] as const) {
    await observe(`courier-${status.toLowerCase()}`, status, async () => {
      const response = await qaRequest<{ success?: boolean; message?: string }>(
        config,
        `/api/courier/orders/${orderId}/status`,
        { method: "PATCH", token: courierSession.accessToken, body: { status } },
      );
      return response.status;
    });
  }

  const [order, courierAfter, deliveryEarningCount, statusEvents] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, paymentStatus: true },
    }),
    prisma.courier.findUnique({
      where: { id: courier.courierId },
      select: { status: true, lifetimeDeliveries: true },
    }),
    prisma.courierEarning.count({ where: { orderId, kind: "DELIVERY" } }),
    prisma.orderStatusEvent.groupBy({
      by: ["status"],
      where: { orderId },
      _count: { _all: true },
    }),
  ]);
  if (!order || !courierAfter) throw new Error("Duplicate-action final audit rows are missing");

  const finalEffects: FinalDeliveryEffects = {
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    courierStatus: courierAfter.status,
    deliveryEarningCount,
    lifetimeDeliveriesDelta: courierAfter.lifetimeDeliveries - courierBefore.lifetimeDeliveries,
  };
  validateFinalDeliveryEffects(finalEffects);
  await auditOrderConsistency(prisma, { orderId });

  return {
    orderId,
    observations,
    finalEffects,
    statusEventCounts: Object.fromEntries(statusEvents.map((row) => [row.status, row._count._all])),
  };
}
