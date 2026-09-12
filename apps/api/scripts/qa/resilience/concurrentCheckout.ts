import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest } from "../types.js";
import { qaRequest, type QaHttpResponse } from "../http.js";
import {
  addQaProductToCart,
  createQaAddress,
  createQaCustomer,
} from "../fixtures.js";
import { saveManifest } from "../manifest.js";
import { pointAtDistanceKm } from "../scenarios/geo.js";
import { singleDeliveryCheckoutBody } from "../scenarios/singleDelivery.js";

export type ConcurrentCheckoutAttemptResult =
  | { kind: "ACCEPTED"; orderId: string; status: number }
  | { kind: "OUT_OF_RANGE"; status: number; code: "OUT_OF_RANGE" }
  | { kind: "REJECTED"; status: number; code?: string };

export interface ConcurrentCheckoutScenarioOptions {
  productId: string;
  restaurantLat: number;
  restaurantLng: number;
  deliveryRadiusKm: number;
  distinctCustomerCount?: number;
  customerIndexBase?: number;
}

export interface ConcurrentCheckoutScenarioResult {
  distinct: ConcurrentCheckoutAttemptResult[];
  sameCart: ConcurrentCheckoutAttemptResult[];
  mixedRange: ConcurrentCheckoutAttemptResult[];
}

type CheckoutData = {
  success?: boolean;
  code?: string;
  message?: string;
  order?: { id?: string; status?: string };
};

export function createStartBarrier() {
  let releaseGate!: () => void;
  let released = false;
  const gate = new Promise<void>((resolve) => {
    releaseGate = () => {
      if (released) return;
      released = true;
      resolve();
    };
  });

  return {
    wait: () => gate,
    release: releaseGate,
  };
}

export function classifyConcurrentCheckout(
  response: QaHttpResponse<CheckoutData>,
): ConcurrentCheckoutAttemptResult {
  const orderId = response.data?.order?.id;
  if (response.ok && response.data?.success !== false && orderId) {
    return { kind: "ACCEPTED", orderId, status: response.status };
  }
  if (!response.ok && response.data?.code === "OUT_OF_RANGE") {
    return { kind: "OUT_OF_RANGE", status: response.status, code: "OUT_OF_RANGE" };
  }
  return {
    kind: "REJECTED",
    status: response.status,
    ...(response.data?.code ? { code: response.data.code } : {}),
  };
}

export function validateSameCartConcurrentCheckout(results: ConcurrentCheckoutAttemptResult[]): void {
  const uniqueAcceptedOrderIds = new Set(
    results.flatMap((result) => result.kind === "ACCEPTED" ? [result.orderId] : []),
  );
  if (uniqueAcceptedOrderIds.size > 1) {
    throw new Error("duplicate-same-cart-checkout: concurrent checkout created more than one order from one cart");
  }
}

async function runSynchronizedCheckouts(
  config: QaConfig,
  attempts: Array<{ token: string; body: Record<string, unknown> }>,
): Promise<Array<QaHttpResponse<CheckoutData>>> {
  const barrier = createStartBarrier();
  const pending = attempts.map(async (attempt) => {
    await barrier.wait();
    return qaRequest<CheckoutData>(config, "/api/orders", {
      method: "POST",
      token: attempt.token,
      body: attempt.body,
    });
  });
  barrier.release();
  const settled = await Promise.allSettled(pending);
  return settled.map((result, index) => {
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      throw new Error(`Concurrent checkout attempt ${index} failed before an HTTP response: ${message}`);
    }
    return result.value;
  });
}

async function rememberReturnedOrderIds(
  manifest: QaRunManifest,
  responses: Array<QaHttpResponse<CheckoutData>>,
): Promise<void> {
  let changed = false;
  for (const response of responses) {
    const orderId = response.data?.order?.id;
    if (orderId && !manifest.orderIds.includes(orderId)) {
      manifest.orderIds.push(orderId);
      changed = true;
    }
  }
  if (changed) await saveManifest(manifest);
}

async function prepareCustomerCheckout(
  config: QaConfig,
  manifest: QaRunManifest,
  input: {
    customerIndex: number;
    productId: string;
    lat: number;
    lng: number;
    label: string;
    notes: string;
  },
) {
  const customer = await createQaCustomer(config, manifest, input.customerIndex);
  const addressId = await createQaAddress(config, manifest, customer.accessToken, {
    labelSuffix: input.label,
    line1: `[QA ${manifest.runId}] ${input.label}`,
    city: "Braga",
    postalCode: "4700-000",
    lat: input.lat,
    lng: input.lng,
    isDefault: true,
  });
  await addQaProductToCart(config, customer.accessToken, input.productId, 1);
  return {
    customer,
    body: {
      ...singleDeliveryCheckoutBody(addressId, manifest.runId),
      notes: input.notes,
    },
  };
}

function expectKinds(
  label: string,
  results: ConcurrentCheckoutAttemptResult[],
  expected: Array<ConcurrentCheckoutAttemptResult["kind"]>,
): void {
  if (results.length !== expected.length) {
    throw new Error(`${label}: expected ${expected.length} results, received ${results.length}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (results[index]?.kind !== expected[index]) {
      throw new Error(`${label}: attempt ${index} expected ${expected[index]}, received ${results[index]?.kind ?? "missing"}`);
    }
  }
}

export async function runConcurrentCheckoutScenario(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: ConcurrentCheckoutScenarioOptions,
): Promise<ConcurrentCheckoutScenarioResult> {
  const distinctCustomerCount = options.distinctCustomerCount ?? 2;
  const base = options.customerIndexBase ?? 100_000;
  if (!Number.isInteger(distinctCustomerCount) || distinctCustomerCount < 2 || distinctCustomerCount > 10) {
    throw new Error("Concurrent checkout distinctCustomerCount must be an integer from 2 to 10");
  }

  const insidePoint = (index: number) => pointAtDistanceKm(
    options.restaurantLat,
    options.restaurantLng,
    1,
    (index * 61) % 360,
  );

  const distinctPrepared = [];
  for (let index = 0; index < distinctCustomerCount; index += 1) {
    const point = insidePoint(index);
    distinctPrepared.push(await prepareCustomerCheckout(config, manifest, {
      customerIndex: base + index,
      productId: options.productId,
      lat: point.lat,
      lng: point.lng,
      label: `concurrent-distinct-${index}`,
      notes: `[QA ${manifest.runId}] concurrent-distinct-${index}`,
    }));
  }

  const distinctResponses = await runSynchronizedCheckouts(
    config,
    distinctPrepared.map((prepared) => ({ token: prepared.customer.accessToken, body: prepared.body })),
  );
  await rememberReturnedOrderIds(manifest, distinctResponses);
  const distinct = distinctResponses.map(classifyConcurrentCheckout);
  expectKinds("distinct concurrent checkout", distinct, Array(distinctCustomerCount).fill("ACCEPTED"));

  const samePoint = insidePoint(20);
  const samePrepared = await prepareCustomerCheckout(config, manifest, {
    customerIndex: base + 50,
    productId: options.productId,
    lat: samePoint.lat,
    lng: samePoint.lng,
    label: "concurrent-same-cart",
    notes: `[QA ${manifest.runId}] concurrent-same-cart`,
  });
  const sameResponses = await runSynchronizedCheckouts(config, [0, 1].map(() => ({
    token: samePrepared.customer.accessToken,
    body: samePrepared.body,
  })));
  await rememberReturnedOrderIds(manifest, sameResponses);
  const sameCart = sameResponses.map(classifyConcurrentCheckout);
  validateSameCartConcurrentCheckout(sameCart);
  const acceptedSameCart = sameCart.filter((result) => result.kind === "ACCEPTED");
  if (acceptedSameCart.length < 1) {
    throw new Error("same-cart concurrent checkout produced no accepted order");
  }
  const sameCartDbOrders = await prisma.order.count({
    where: {
      userId: samePrepared.customer.userId,
      notes: { contains: `[QA ${manifest.runId}] concurrent-same-cart` },
    },
  });
  if (sameCartDbOrders > 1) {
    throw new Error("duplicate-same-cart-checkout: database contains more than one order from one concurrent cart");
  }

  const mixedInside = insidePoint(30);
  const mixedOutside = pointAtDistanceKm(
    options.restaurantLat,
    options.restaurantLng,
    options.deliveryRadiusKm + 0.5,
    180,
  );
  const mixedPrepared = [
    await prepareCustomerCheckout(config, manifest, {
      customerIndex: base + 60,
      productId: options.productId,
      lat: mixedInside.lat,
      lng: mixedInside.lng,
      label: "concurrent-mixed-inside",
      notes: `[QA ${manifest.runId}] concurrent-mixed-inside`,
    }),
    await prepareCustomerCheckout(config, manifest, {
      customerIndex: base + 61,
      productId: options.productId,
      lat: mixedOutside.lat,
      lng: mixedOutside.lng,
      label: "concurrent-mixed-outside",
      notes: `[QA ${manifest.runId}] concurrent-mixed-outside`,
    }),
  ];
  const mixedResponses = await runSynchronizedCheckouts(
    config,
    mixedPrepared.map((prepared) => ({ token: prepared.customer.accessToken, body: prepared.body })),
  );
  await rememberReturnedOrderIds(manifest, mixedResponses);
  const mixedRange = mixedResponses.map(classifyConcurrentCheckout);
  expectKinds("mixed-range concurrent checkout", mixedRange, ["ACCEPTED", "OUT_OF_RANGE"]);

  return { distinct, sameCart, mixedRange };
}
