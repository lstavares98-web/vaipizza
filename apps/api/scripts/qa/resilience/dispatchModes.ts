import type { PrismaClient } from "@prisma/client";
import { evaluateCourierGeoEligibility } from "../../../src/modules/dispatch/dispatch.policy.js";
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

export interface DispatchEligibilityInput {
  status: string;
  distanceKm: number | null;
  dispatchRadiusKm: number;
  locationUpdatedAtMs: number | null;
  nowMs: number;
  maxLocationAgeSeconds: number;
  accuracyM: number | null;
  maxAccuracyM: number;
}

export type DispatchEligibilityReason = "OFFLINE" | "BUSY" | "NO_LOCATION" | "STALE_LOCATION" | "LOW_ACCURACY" | "OUTSIDE_DISPATCH_ZONE";

export interface RejectReassignmentObservation {
  orderCourierId: string | null;
  firstCourierId: string;
  secondCourierId: string;
  firstAssignmentStatus: string;
  secondAssignmentStatus: string;
  rejectedAssignmentAcceptStatus: number;
}

export interface DispatchModeOptions {
  productId: string;
  staffToken: string;
  kitchenToken: string;
  restaurantLat: number;
  restaurantLng: number;
  dispatchRadiusKm: number;
  customerIndexBase?: number;
  courierIndexBase?: number;
}

export interface DispatchModeResult {
  rejectThenNext: RejectReassignmentObservation;
  ineligible: Array<{ mode: string; selectedCourierId: string; ineligibleCourierId: string }>;
  expiryThenNext: RejectReassignmentObservation & { expiredAssignmentStatus: string };
  manualReassign: { orderCourierId: string | null; oldAssignmentStatus: string; newAssignmentStatus: string };
}

interface ExternalCourierIsolationArgs {
  couriers: Array<{
    id: string;
    status: string;
    lat: number | null;
    lng: number | null;
    locationUpdatedAt: Date | null;
    locationAccuracyM: number | null;
  }>;
  qaCourierIds: string[];
  restaurant: { lat: number; lng: number; courierDispatchRadiusKm: number };
  now: Date;
  maxLocationAgeSeconds: number;
  maxAccuracyMeters: number;
}

export function dispatchEligibilityExpectation(input: DispatchEligibilityInput): { eligible: boolean; reason: DispatchEligibilityReason | null } {
  if (input.status === "OFFLINE") return { eligible: false, reason: "OFFLINE" };
  if (input.status !== "AVAILABLE") return { eligible: false, reason: "BUSY" };
  if (input.distanceKm === null || input.locationUpdatedAtMs === null || input.accuracyM === null) {
    return { eligible: false, reason: "NO_LOCATION" };
  }
  if (input.nowMs - input.locationUpdatedAtMs > input.maxLocationAgeSeconds * 1000) {
    return { eligible: false, reason: "STALE_LOCATION" };
  }
  if (input.accuracyM > input.maxAccuracyM) return { eligible: false, reason: "LOW_ACCURACY" };
  if (input.distanceKm > input.dispatchRadiusKm) return { eligible: false, reason: "OUTSIDE_DISPATCH_ZONE" };
  return { eligible: true, reason: null };
}

export function eligibleExternalCourierIds(args: ExternalCourierIsolationArgs): string[] {
  const qaCourierIds = new Set(args.qaCourierIds);
  return args.couriers
    .filter((courier) => !qaCourierIds.has(courier.id) && courier.status === "AVAILABLE")
    .filter((courier) => evaluateCourierGeoEligibility(
      args.restaurant,
      courier,
      args.now,
      args.maxLocationAgeSeconds,
      args.maxAccuracyMeters,
    ).eligible)
    .map((courier) => courier.id);
}

export function validateRejectReassignment(observation: RejectReassignmentObservation): void {
  if (observation.firstAssignmentStatus !== "REJECTED" && observation.firstAssignmentStatus !== "EXPIRED") {
    throw new Error(`Rejected/expired old offer has invalid status ${observation.firstAssignmentStatus}`);
  }
  if (observation.rejectedAssignmentAcceptStatus !== 409) {
    throw new Error(`Rejected/expired old offer must return 409 when accepted later; received ${observation.rejectedAssignmentAcceptStatus}`);
  }
  if (observation.secondAssignmentStatus !== "ACCEPTED") {
    throw new Error(`Next courier assignment must be ACCEPTED; received ${observation.secondAssignmentStatus}`);
  }
  if (observation.orderCourierId !== observation.secondCourierId) {
    throw new Error("Order courier owner does not match the next courier after rejection/expiry");
  }
  if (observation.orderCourierId === observation.firstCourierId) {
    throw new Error("Rejected/expired courier still owns the order");
  }
}

async function assertNoNonQaEligibleCouriers(
  prisma: PrismaClient,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
): Promise<void> {
  const couriers = await prisma.courier.findMany({
    where: { status: "AVAILABLE" },
    select: {
      id: true,
      status: true,
      lat: true,
      lng: true,
      locationUpdatedAt: true,
      locationAccuracyM: true,
    },
  });
  const eligibleIds = eligibleExternalCourierIds({
    couriers,
    qaCourierIds: manifest.courierIds,
    restaurant: {
      lat: options.restaurantLat,
      lng: options.restaurantLng,
      courierDispatchRadiusKm: options.dispatchRadiusKm,
    },
    now: new Date(),
    maxLocationAgeSeconds: 120,
    maxAccuracyMeters: 100,
  });
  if (eligibleIds.length !== 0) {
    throw new Error(`Dispatch resilience is blocked because ${eligibleIds.length} non-QA eligible courier(s) exist`);
  }
}

async function createOrderAndEnterDispatch(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
  input: { customerIndex: number; label: string },
): Promise<string> {
  await assertNoNonQaEligibleCouriers(prisma, manifest, options);
  const point = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, (input.customerIndex * 29) % 360);
  const customer = await createQaCustomer(config, manifest, input.customerIndex);
  const addressId = await createQaAddress(config, manifest, customer.accessToken, {
    labelSuffix: input.label,
    line1: `[QA ${manifest.runId}] ${input.label}`,
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
      body: { ...singleDeliveryCheckoutBody(addressId, manifest.runId), notes: `[QA ${manifest.runId}] ${input.label}` },
    },
  );
  const orderId = checkout.data?.order?.id;
  if (!checkout.ok || checkout.data?.success === false || !orderId || checkout.data.order?.status !== "NEW") {
    throw new Error(`${input.label}: checkout failed: ${checkout.data?.message ?? `HTTP ${checkout.status}`}`);
  }
  if (!manifest.orderIds.includes(orderId)) {
    manifest.orderIds.push(orderId);
    await saveManifest(manifest);
  }

  const accepted = await qaRequest<{ success?: boolean; order?: { status?: string }; message?: string }>(
    config,
    `/api/restaurant/orders/${orderId}/status`,
    { method: "PATCH", token: options.staffToken, body: { status: "ACCEPTED" } },
  );
  if (!accepted.ok || accepted.data?.success === false || accepted.data?.order?.status !== "PREPARING") {
    throw new Error(`${input.label}: restaurant accept failed: ${accepted.data?.message ?? `HTTP ${accepted.status}`}`);
  }

  const ready = await qaRequest<{ success?: boolean; order?: { status?: string }; message?: string }>(
    config,
    `/api/restaurant/orders/${orderId}/status`,
    { method: "PATCH", token: options.kitchenToken, body: { status: "READY_FOR_PICKUP" } },
  );
  if (!ready.ok || ready.data?.success === false || ready.data?.order?.status !== "WAITING_FOR_COURIER") {
    throw new Error(`${input.label}: kitchen ready failed: ${ready.data?.message ?? `HTTP ${ready.status}`}`);
  }
  return orderId;
}

async function acceptAssignment(config: QaConfig, token: string, assignmentId: string): Promise<number> {
  const response = await qaRequest<{ success?: boolean; message?: string }>(
    config,
    `/api/courier/assignments/${assignmentId}/accept`,
    { method: "POST", token },
  );
  return response.status;
}

async function runRejectThenNext(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
  customerIndex: number,
  courierIndexBase: number,
): Promise<RejectReassignmentObservation> {
  const firstPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 0.5, 0);
  const secondPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 0);
  const first = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase,
    status: "AVAILABLE",
    lat: firstPoint.lat,
    lng: firstPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const second = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase + 1,
    status: "AVAILABLE",
    lat: secondPoint.lat,
    lng: secondPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const firstSession = await loginQaCourierSession(config, first.email, first.password);
  const secondSession = await loginQaCourierSession(config, second.email, second.password);

  const orderId = await createOrderAndEnterDispatch(prisma, config, manifest, options, { customerIndex, label: "dispatch-reject-next" });
  const firstAssignment = await prisma.courierAssignment.findFirst({ where: { orderId, status: "OFFERED" } });
  if (!firstAssignment || firstAssignment.courierId !== first.courierId) {
    throw new Error("dispatch-reject-next: nearest first QA courier did not receive the initial offer");
  }

  const rejected = await qaRequest<{ success?: boolean; message?: string }>(
    config,
    `/api/courier/assignments/${firstAssignment.id}/reject`,
    { method: "POST", token: firstSession.accessToken },
  );
  if (!rejected.ok || rejected.data?.success === false) {
    throw new Error(`dispatch-reject-next: reject failed: ${rejected.data?.message ?? `HTTP ${rejected.status}`}`);
  }

  const oldAcceptStatus = await acceptAssignment(config, firstSession.accessToken, firstAssignment.id);
  const secondAssignment = await prisma.courierAssignment.findFirst({ where: { orderId, courierId: second.courierId } });
  if (!secondAssignment || secondAssignment.status !== "OFFERED") {
    throw new Error("dispatch-reject-next: second courier did not receive the next offer");
  }
  const secondAcceptStatus = await acceptAssignment(config, secondSession.accessToken, secondAssignment.id);
  if (secondAcceptStatus < 200 || secondAcceptStatus >= 300) {
    throw new Error(`dispatch-reject-next: second courier accept failed with HTTP ${secondAcceptStatus}`);
  }

  const [order, oldAssignment, nextAssignment] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { courierId: true } }),
    prisma.courierAssignment.findUnique({ where: { id: firstAssignment.id }, select: { status: true } }),
    prisma.courierAssignment.findUnique({ where: { id: secondAssignment.id }, select: { status: true } }),
  ]);
  const observation: RejectReassignmentObservation = {
    orderCourierId: order?.courierId ?? null,
    firstCourierId: first.courierId,
    secondCourierId: second.courierId,
    firstAssignmentStatus: oldAssignment?.status ?? "MISSING",
    secondAssignmentStatus: nextAssignment?.status ?? "MISSING",
    rejectedAssignmentAcceptStatus: oldAcceptStatus,
  };
  validateRejectReassignment(observation);
  return observation;
}

async function runIneligibleMode(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
  mode: "offline" | "stale" | "inaccurate" | "outside",
  customerIndex: number,
  courierIndexBase: number,
) {
  const near = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 0.1, 45);
  const outside = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, options.dispatchRadiusKm + 1, 45);
  const ineligible = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase,
    status: mode === "offline" ? "OFFLINE" : "AVAILABLE",
    lat: mode === "outside" ? outside.lat : near.lat,
    lng: mode === "outside" ? outside.lng : near.lng,
    accuracyM: mode === "inaccurate" ? 1_000 : 10,
    locationUpdatedAt: mode === "stale" ? new Date(Date.now() - 10 * 60_000) : new Date(),
  });
  const fallbackPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 45);
  const fallback = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase + 1,
    status: "AVAILABLE",
    lat: fallbackPoint.lat,
    lng: fallbackPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const fallbackSession = await loginQaCourierSession(config, fallback.email, fallback.password);

  const orderId = await createOrderAndEnterDispatch(prisma, config, manifest, options, { customerIndex, label: `dispatch-${mode}` });
  const offered = await prisma.courierAssignment.findFirst({ where: { orderId, status: "OFFERED" } });
  if (!offered || offered.courierId !== fallback.courierId) {
    throw new Error(`dispatch-${mode}: ineligible courier was selected or fallback did not receive the offer`);
  }
  const ineligibleAssignmentCount = await prisma.courierAssignment.count({ where: { orderId, courierId: ineligible.courierId } });
  if (ineligibleAssignmentCount !== 0) {
    throw new Error(`dispatch-${mode}: ineligible courier received an assignment`);
  }
  const acceptStatus = await acceptAssignment(config, fallbackSession.accessToken, offered.id);
  if (acceptStatus < 200 || acceptStatus >= 300) throw new Error(`dispatch-${mode}: fallback accept failed with HTTP ${acceptStatus}`);
  return { mode, selectedCourierId: fallback.courierId, ineligibleCourierId: ineligible.courierId };
}

async function pollForExpiryAndNextOffer(
  prisma: PrismaClient,
  orderId: string,
  firstAssignmentId: string,
  secondCourierId: string,
  expiresAt: Date,
): Promise<{ expiredStatus: string; secondAssignmentId: string }> {
  const deadline = Math.max(Date.now() + 20_000, expiresAt.getTime() + 35_000);
  while (Date.now() < deadline) {
    const [firstAssignment, secondAssignment] = await Promise.all([
      prisma.courierAssignment.findUnique({ where: { id: firstAssignmentId }, select: { status: true } }),
      prisma.courierAssignment.findFirst({ where: { orderId, courierId: secondCourierId }, select: { id: true, status: true } }),
    ]);
    if (firstAssignment?.status === "EXPIRED" && secondAssignment?.status === "OFFERED") {
      return { expiredStatus: firstAssignment.status, secondAssignmentId: secondAssignment.id };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("dispatch-expiry: timed out waiting for expiry sweep and next courier offer");
}

async function runExpiryThenNext(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
  customerIndex: number,
  courierIndexBase: number,
): Promise<RejectReassignmentObservation & { expiredAssignmentStatus: string }> {
  const firstPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 0.5, 90);
  const secondPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 90);
  const first = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase,
    status: "AVAILABLE",
    lat: firstPoint.lat,
    lng: firstPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const second = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase + 1,
    status: "AVAILABLE",
    lat: secondPoint.lat,
    lng: secondPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const firstSession = await loginQaCourierSession(config, first.email, first.password);
  const secondSession = await loginQaCourierSession(config, second.email, second.password);
  const orderId = await createOrderAndEnterDispatch(prisma, config, manifest, options, { customerIndex, label: "dispatch-expiry" });
  const firstAssignment = await prisma.courierAssignment.findFirst({ where: { orderId, status: "OFFERED" } });
  if (!firstAssignment || firstAssignment.courierId !== first.courierId) {
    throw new Error("dispatch-expiry: first courier did not receive initial offer");
  }

  const next = await pollForExpiryAndNextOffer(prisma, orderId, firstAssignment.id, second.courierId, firstAssignment.expiresAt);
  const oldAcceptStatus = await acceptAssignment(config, firstSession.accessToken, firstAssignment.id);
  const secondAcceptStatus = await acceptAssignment(config, secondSession.accessToken, next.secondAssignmentId);
  if (secondAcceptStatus < 200 || secondAcceptStatus >= 300) {
    throw new Error(`dispatch-expiry: second courier accept failed with HTTP ${secondAcceptStatus}`);
  }
  const [order, secondAssignment] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { courierId: true } }),
    prisma.courierAssignment.findUnique({ where: { id: next.secondAssignmentId }, select: { status: true } }),
  ]);
  const observation = {
    orderCourierId: order?.courierId ?? null,
    firstCourierId: first.courierId,
    secondCourierId: second.courierId,
    firstAssignmentStatus: next.expiredStatus,
    secondAssignmentStatus: secondAssignment?.status ?? "MISSING",
    rejectedAssignmentAcceptStatus: oldAcceptStatus,
    expiredAssignmentStatus: next.expiredStatus,
  };
  validateRejectReassignment(observation);
  return observation;
}

async function runManualReassign(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
  customerIndex: number,
  courierIndexBase: number,
) {
  const firstPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 0.5, 135);
  const secondPoint = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 135);
  const first = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase,
    status: "AVAILABLE",
    lat: firstPoint.lat,
    lng: firstPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const second = await createQaCourierFixture(prisma, config, manifest, {
    index: courierIndexBase + 1,
    status: "AVAILABLE",
    lat: secondPoint.lat,
    lng: secondPoint.lng,
    accuracyM: 10,
    locationUpdatedAt: new Date(),
  });
  const firstSession = await loginQaCourierSession(config, first.email, first.password);
  const orderId = await createOrderAndEnterDispatch(prisma, config, manifest, options, { customerIndex, label: "dispatch-manual-reassign" });
  const firstAssignment = await prisma.courierAssignment.findFirst({ where: { orderId, courierId: first.courierId, status: "OFFERED" } });
  if (!firstAssignment) throw new Error("dispatch-manual-reassign: initial assignment missing");
  const firstAccept = await acceptAssignment(config, firstSession.accessToken, firstAssignment.id);
  if (firstAccept < 200 || firstAccept >= 300) throw new Error(`dispatch-manual-reassign: initial accept failed with HTTP ${firstAccept}`);

  const reassign = await qaRequest<{ success?: boolean; message?: string }>(
    config,
    `/api/restaurant/orders/${orderId}/reassign-courier`,
    { method: "POST", token: options.staffToken, body: { courierId: second.courierId } },
  );
  if (!reassign.ok || reassign.data?.success === false) {
    throw new Error(`dispatch-manual-reassign: supported reassign endpoint failed: ${reassign.data?.message ?? `HTTP ${reassign.status}`}`);
  }

  const [order, oldAssignment, newAssignment] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { courierId: true } }),
    prisma.courierAssignment.findUnique({ where: { id: firstAssignment.id }, select: { status: true } }),
    prisma.courierAssignment.findFirst({ where: { orderId, courierId: second.courierId }, orderBy: { offeredAt: "desc" }, select: { status: true } }),
  ]);
  if (order?.courierId !== second.courierId || oldAssignment?.status !== "CANCELLED" || newAssignment?.status !== "ACCEPTED") {
    throw new Error("dispatch-manual-reassign: final ownership/assignment state is inconsistent");
  }
  return {
    orderCourierId: order.courierId,
    oldAssignmentStatus: oldAssignment.status,
    newAssignmentStatus: newAssignment.status,
  };
}

export async function runDispatchModeScenario(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: DispatchModeOptions,
): Promise<DispatchModeResult> {
  const customerBase = options.customerIndexBase ?? 300_000;
  const courierBase = options.courierIndexBase ?? 1_000;
  const rejectThenNext = await runRejectThenNext(prisma, config, manifest, options, customerBase, courierBase);
  const modes = ["offline", "stale", "inaccurate", "outside"] as const;
  const ineligible = [];
  for (let index = 0; index < modes.length; index += 1) {
    ineligible.push(await runIneligibleMode(
      prisma,
      config,
      manifest,
      options,
      modes[index]!,
      customerBase + 10 + index,
      courierBase + 10 + index * 2,
    ));
  }
  const expiryThenNext = await runExpiryThenNext(prisma, config, manifest, options, customerBase + 30, courierBase + 30);
  const manualReassign = await runManualReassign(prisma, config, manifest, options, customerBase + 40, courierBase + 40);
  return { rejectThenNext, ineligible, expiryThenNext, manualReassign };
}