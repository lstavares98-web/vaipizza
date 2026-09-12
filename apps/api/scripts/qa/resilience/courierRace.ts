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
import { createStartBarrier } from "./concurrentCheckout.js";

export interface CourierRaceAssignmentState {
  courierId: string;
  status: "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
}

export interface CourierRaceAttempt {
  courierId: string;
  status: number;
  accepted: boolean;
}

export interface CourierRaceSnapshot {
  orderId: string;
  orderCourierId: string | null;
  assignments: CourierRaceAssignmentState[];
  attempts: CourierRaceAttempt[];
}

export interface CourierRaceOptions {
  productId: string;
  staffToken: string;
  kitchenToken: string;
  restaurantLat: number;
  restaurantLng: number;
  courierCount?: number;
  customerIndex?: number;
  courierIndexBase?: number;
}

export interface CourierRacePreparationSteps {
  createPreparingOrder: () => Promise<string>;
  createOffers: (orderId: string) => Promise<void>;
  markReady: (orderId: string) => Promise<void>;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function prepareCourierRaceBeforeDispatch(
  steps: CourierRacePreparationSteps,
): Promise<string> {
  const orderId = await steps.createPreparingOrder();
  await steps.createOffers(orderId);
  await steps.markReady(orderId);
  return orderId;
}

export function validateCourierRaceOutcome(snapshot: CourierRaceSnapshot): void {
  const acceptedAssignments = snapshot.assignments.filter((assignment) => assignment.status === "ACCEPTED");
  if (acceptedAssignments.length !== 1) {
    throw new Error(`Courier race must have exactly one accepted winner; found ${acceptedAssignments.length}`);
  }

  const winner = acceptedAssignments[0]!;
  if (snapshot.orderCourierId !== winner.courierId) {
    throw new Error(`Courier race order owner ${snapshot.orderCourierId ?? "<none>"} does not match winning courier ${winner.courierId}`);
  }

  const successfulAttempts = snapshot.attempts.filter((attempt) => attempt.accepted);
  if (successfulAttempts.length !== 1 || successfulAttempts[0]?.courierId !== winner.courierId) {
    throw new Error("Courier race API attempts do not identify exactly one matching winner");
  }

  for (const attempt of snapshot.attempts) {
    if (attempt.courierId === winner.courierId) {
      if (attempt.status < 200 || attempt.status >= 300 || !attempt.accepted) {
        throw new Error("Courier race winning attempt did not return success");
      }
      continue;
    }
    if (attempt.accepted || attempt.status !== 409) {
      throw new Error(`Courier race losing attempt for ${attempt.courierId} must return 409 conflict/unavailable`);
    }
  }

  const losingActiveOffers = snapshot.assignments.filter(
    (assignment) => assignment.courierId !== winner.courierId && assignment.status === "OFFERED",
  );
  if (losingActiveOffers.length > 0) {
    throw new Error(`Courier race left ${losingActiveOffers.length} losing courier(s) with an active OFFERED assignment`);
  }

  const duplicateAcceptedCouriers = unique(acceptedAssignments.map((assignment) => assignment.courierId));
  if (duplicateAcceptedCouriers.length !== 1) {
    throw new Error("Courier race produced multiple courier owners");
  }
}

async function createPreparingQaOrder(
  config: QaConfig,
  manifest: QaRunManifest,
  options: CourierRaceOptions,
): Promise<string> {
  const point = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 75);
  const customer = await createQaCustomer(config, manifest, options.customerIndex ?? 200_000);
  const addressId = await createQaAddress(config, manifest, customer.accessToken, {
    labelSuffix: "courier-race",
    line1: `[QA ${manifest.runId}] courier race`,
    city: "Braga",
    postalCode: "4700-000",
    lat: point.lat,
    lng: point.lng,
    isDefault: true,
  });
  await addQaProductToCart(config, customer.accessToken, options.productId, 1);

  const checkout = await qaRequest<{
    success?: boolean;
    order?: { id?: string; status?: string };
    message?: string;
  }>(config, "/api/orders", {
    method: "POST",
    token: customer.accessToken,
    body: {
      ...singleDeliveryCheckoutBody(addressId, manifest.runId),
      notes: `[QA ${manifest.runId}] courier-race`,
    },
  });
  const orderId = checkout.data?.order?.id;
  if (!checkout.ok || checkout.data?.success === false || !orderId || checkout.data.order?.status !== "NEW") {
    throw new Error(`Courier race checkout failed: ${checkout.data?.message ?? `HTTP ${checkout.status}`}`);
  }
  if (!manifest.orderIds.includes(orderId)) {
    manifest.orderIds.push(orderId);
    await saveManifest(manifest);
  }

  const accepted = await qaRequest<{ success?: boolean; order?: { id?: string; status?: string }; message?: string }>(
    config,
    `/api/restaurant/orders/${orderId}/status`,
    { method: "PATCH", token: options.staffToken, body: { status: "ACCEPTED" } },
  );
  if (!accepted.ok || accepted.data?.success === false || accepted.data?.order?.status !== "PREPARING") {
    throw new Error(`Courier race restaurant accept failed: ${accepted.data?.message ?? `HTTP ${accepted.status}`}`);
  }

  return orderId;
}

async function markQaOrderReady(
  config: QaConfig,
  orderId: string,
  kitchenToken: string,
): Promise<void> {
  const ready = await qaRequest<{ success?: boolean; order?: { id?: string; status?: string }; message?: string }>(
    config,
    `/api/restaurant/orders/${orderId}/status`,
    { method: "PATCH", token: kitchenToken, body: { status: "READY_FOR_PICKUP" } },
  );
  if (!ready.ok || ready.data?.success === false || ready.data?.order?.status !== "WAITING_FOR_COURIER") {
    throw new Error(`Courier race kitchen ready failed: ${ready.data?.message ?? `HTTP ${ready.status}`}`);
  }
}

export async function runCourierAcceptanceRace(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: CourierRaceOptions,
): Promise<CourierRaceSnapshot> {
  const courierCount = options.courierCount ?? 2;
  if (!Number.isInteger(courierCount) || courierCount < 2 || courierCount > 3) {
    throw new Error("Courier race courierCount must be 2 or 3");
  }

  const courierIndexBase = options.courierIndexBase ?? 100;
  const racers = [];
  for (let index = 0; index < courierCount; index += 1) {
    const courier = await createQaCourierFixture(prisma, config, manifest, {
      index: courierIndexBase + index,
      status: "ASSIGNED",
      lat: options.restaurantLat,
      lng: options.restaurantLng,
      accuracyM: 10,
      locationUpdatedAt: new Date(),
    });
    const session = await loginQaCourierSession(config, courier.email, courier.password);
    racers.push({ ...courier, session });
  }

  let assignments: Array<{ id: string; courierId: string }> = [];
  const orderId = await prepareCourierRaceBeforeDispatch({
    createPreparingOrder: () => createPreparingQaOrder(config, manifest, options),
    createOffers: async (preparedOrderId) => {
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      assignments = await prisma.$transaction(
        racers.map((racer) => prisma.courierAssignment.create({
          data: {
            orderId: preparedOrderId,
            courierId: racer.courierId,
            status: "OFFERED",
            expiresAt,
          },
          select: { id: true, courierId: true },
        })),
      );
    },
    markReady: async (preparedOrderId) => {
      await markQaOrderReady(config, preparedOrderId, options.kitchenToken);
      const unexpectedAssignments = await prisma.courierAssignment.findMany({
        where: {
          orderId: preparedOrderId,
          courierId: { notIn: racers.map((racer) => racer.courierId) },
        },
        select: { courierId: true, status: true },
      });
      if (unexpectedAssignments.length > 0) {
        throw new Error(
          `Courier race dispatch isolation failed: ${unexpectedAssignments.length} non-QA courier assignment(s) appeared`,
        );
      }
    },
  });

  if (assignments.length !== racers.length) {
    throw new Error(`Courier race expected ${racers.length} QA offers but created ${assignments.length}`);
  }

  const barrier = createStartBarrier();
  const pending = racers.map(async (racer) => {
    const assignment = assignments.find((item) => item.courierId === racer.courierId)!;
    await barrier.wait();
    const response = await qaRequest<{ success?: boolean; order?: { id?: string }; message?: string }>(
      config,
      `/api/courier/assignments/${assignment.id}/accept`,
      { method: "POST", token: racer.session.accessToken },
    );
    return {
      courierId: racer.courierId,
      status: response.status,
      accepted: response.ok && response.data?.success !== false && response.data?.order?.id === orderId,
    } satisfies CourierRaceAttempt;
  });
  barrier.release();
  const attempts = await Promise.all(pending);

  const finalOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { courierId: true },
  });
  const finalAssignments = await prisma.courierAssignment.findMany({
    where: { orderId },
    select: { courierId: true, status: true },
    orderBy: { offeredAt: "asc" },
  });

  const snapshot: CourierRaceSnapshot = {
    orderId,
    orderCourierId: finalOrder?.courierId ?? null,
    assignments: finalAssignments,
    attempts,
  };
  validateCourierRaceOutcome(snapshot);
  return snapshot;
}
