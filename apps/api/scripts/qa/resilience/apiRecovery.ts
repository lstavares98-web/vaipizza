import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest } from "../types.js";
import { expectQaSuccess, qaRequest } from "../http.js";
import { addQaProductToCart, createQaAddress, createQaCustomer } from "../fixtures.js";
import { saveManifest } from "../manifest.js";
import { pointAtDistanceKm } from "../scenarios/geo.js";
import { singleDeliveryCheckoutBody } from "../scenarios/singleDelivery.js";
import {
  QaDroppedResponseError,
  QaTimeoutError,
  delayRequest,
  dropResponseAfterServerCall,
  withTimeout,
} from "./faultTransport.js";

export type TransportUncertainty = "TIMEOUT" | "DROPPED_RESPONSE";
export type InitialTransportOutcome = "UNKNOWN";
export type RecoveryTransportOutcome = "CONFIRMED" | "UNKNOWN";

export type ReconciledCheckoutState =
  | { kind: "NO_ORDER"; orderIds: string[] }
  | { kind: "ONE_ORDER"; orderIds: string[]; orderId: string }
  | { kind: "DUPLICATE_ORDERS"; orderIds: string[] };

export interface CheckoutRecoveryResult {
  transportOutcome: RecoveryTransportOutcome;
  state: ReconciledCheckoutState;
}

export interface ApiRecoveryScenarioOptions {
  productId: string;
  staffToken: string;
  restaurantLat: number;
  restaurantLng: number;
  customerIndexBase?: number;
}

export interface ApiRecoveryScenarioResult {
  delayedCheckout: CheckoutRecoveryResult;
  timeoutCheckout: CheckoutRecoveryResult;
  lostResponseRetry: CheckoutRecoveryResult & { retryStatus: number };
  delayedTransition: {
    orderId: string;
    finalStatus: string;
    syntheticReadStatus: 500;
    recoveredReadStatus: number;
  };
}

type CheckoutResponse = {
  success?: boolean;
  message?: string;
  code?: string;
  order?: { id?: string; status?: string };
};

type CustomerOrderResponse = {
  success?: boolean;
  message?: string;
  order?: { id?: string; status?: string };
};

export function classifyTransportUncertainty(_uncertainty: TransportUncertainty): InitialTransportOutcome {
  return "UNKNOWN";
}

export function reconcileCheckoutAfterUncertainty(orderIds: readonly string[]): ReconciledCheckoutState {
  const uniqueOrderIds = Array.from(new Set(orderIds));
  if (uniqueOrderIds.length === 0) return { kind: "NO_ORDER", orderIds: [] };
  if (uniqueOrderIds.length === 1) {
    return { kind: "ONE_ORDER", orderIds: uniqueOrderIds, orderId: uniqueOrderIds[0]! };
  }
  return { kind: "DUPLICATE_ORDERS", orderIds: uniqueOrderIds };
}

export function validateRecoveredCheckout(state: ReconciledCheckoutState): void {
  if (state.kind === "DUPLICATE_ORDERS") {
    throw new Error(
      `duplicate orders after uncertain checkout: ${state.orderIds.join(", ")}`,
    );
  }
}

function isTransportUncertainty(error: unknown): boolean {
  return error instanceof QaTimeoutError || error instanceof QaDroppedResponseError;
}

export async function recoverCheckoutAfterUncertainMutation(
  mutation: () => Promise<unknown>,
  readAuthoritativeOrderIds: () => Promise<string[]>,
  rememberDiscoveredOrderIds: (orderIds: string[]) => Promise<void>,
): Promise<CheckoutRecoveryResult> {
  let transportOutcome: RecoveryTransportOutcome = "CONFIRMED";

  try {
    await mutation();
  } catch (error) {
    if (!isTransportUncertainty(error)) throw error;
    transportOutcome = "UNKNOWN";
  }

  const orderIds = await readAuthoritativeOrderIds();
  await rememberDiscoveredOrderIds(orderIds);
  const state = reconcileCheckoutAfterUncertainty(orderIds);
  validateRecoveredCheckout(state);

  return { transportOutcome, state };
}

async function rememberOrderIds(manifest: QaRunManifest, orderIds: readonly string[]): Promise<void> {
  let changed = false;
  for (const orderId of orderIds) {
    if (!manifest.orderIds.includes(orderId)) {
      manifest.orderIds.push(orderId);
      changed = true;
    }
  }
  if (changed) await saveManifest(manifest);
}

async function waitForCaseOrderIds(
  prisma: PrismaClient,
  userId: string,
  marker: string,
  timeoutMs = 6_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  do {
    const rows = await prisma.order.findMany({
      where: { userId, notes: { contains: marker } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (rows.length > 0) return rows.map((row) => row.id);
    await delayRequest(100);
  } while (Date.now() < deadline);

  const rows = await prisma.order.findMany({
    where: { userId, notes: { contains: marker } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => row.id);
}

async function prepareCheckoutCase(
  config: QaConfig,
  manifest: QaRunManifest,
  options: ApiRecoveryScenarioOptions,
  customerIndex: number,
  label: string,
) {
  const customer = await createQaCustomer(config, manifest, customerIndex);
  const point = pointAtDistanceKm(options.restaurantLat, options.restaurantLng, 1, 90);
  const addressId = await createQaAddress(config, manifest, customer.accessToken, {
    labelSuffix: `api-${label}`,
    line1: `[QA ${manifest.runId}] API recovery ${label}`,
    city: "Braga",
    postalCode: "4700-000",
    lat: point.lat,
    lng: point.lng,
    isDefault: true,
  });
  await addQaProductToCart(config, customer.accessToken, options.productId, 1);
  const marker = `[QA ${manifest.runId}] api-recovery-${label}`;
  return {
    customer,
    marker,
    body: {
      ...singleDeliveryCheckoutBody(addressId, manifest.runId),
      notes: marker,
    },
  };
}

async function performCheckout(
  config: QaConfig,
  token: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await qaRequest<CheckoutResponse>(config, "/api/orders", {
    method: "POST",
    token,
    body,
  });
  const data = expectQaSuccess(response, "API recovery checkout");
  const orderId = data.order?.id;
  if (!orderId) throw new Error("API recovery checkout returned no order id");
  return orderId;
}

function requireOneOrder(label: string, result: CheckoutRecoveryResult): string {
  if (result.state.kind !== "ONE_ORDER") {
    throw new Error(`${label}: expected one authoritative order, received ${result.state.kind}`);
  }
  return result.state.orderId;
}

export async function runApiRecoveryScenario(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: ApiRecoveryScenarioOptions,
): Promise<ApiRecoveryScenarioResult> {
  const base = options.customerIndexBase ?? 500_000;

  const delayed = await prepareCheckoutCase(config, manifest, options, base, "delayed-checkout");
  const delayedCheckout = await recoverCheckoutAfterUncertainMutation(
    async () => {
      const orderId = await performCheckout(config, delayed.customer.accessToken, delayed.body);
      await rememberOrderIds(manifest, [orderId]);
      await delayRequest(150);
    },
    () => waitForCaseOrderIds(prisma, delayed.customer.userId, delayed.marker),
    (ids) => rememberOrderIds(manifest, ids),
  );
  requireOneOrder("delayed checkout", delayedCheckout);

  const timeoutCase = await prepareCheckoutCase(config, manifest, options, base + 1, "timeout-checkout");
  let timeoutUnderlying: Promise<string> | null = null;
  const timeoutCheckout = await recoverCheckoutAfterUncertainMutation(
    async () => {
      timeoutUnderlying = performCheckout(config, timeoutCase.customer.accessToken, timeoutCase.body);
      await withTimeout(timeoutUnderlying, 1, "checkout-timeout");
    },
    () => waitForCaseOrderIds(prisma, timeoutCase.customer.userId, timeoutCase.marker),
    (ids) => rememberOrderIds(manifest, ids),
  );
  requireOneOrder("timeout checkout", timeoutCheckout);
  if (!timeoutUnderlying) throw new Error("timeout checkout did not start the server request");
  const timeoutServerOrderId = await timeoutUnderlying;
  await rememberOrderIds(manifest, [timeoutServerOrderId]);

  const lost = await prepareCheckoutCase(config, manifest, options, base + 2, "lost-response");
  const lostInitial = await recoverCheckoutAfterUncertainMutation(
    () => dropResponseAfterServerCall(
      () => performCheckout(config, lost.customer.accessToken, lost.body),
      "checkout-response",
    ),
    () => waitForCaseOrderIds(prisma, lost.customer.userId, lost.marker),
    (ids) => rememberOrderIds(manifest, ids),
  );
  requireOneOrder("lost-response checkout", lostInitial);

  const retry = await qaRequest<CheckoutResponse>(config, "/api/orders", {
    method: "POST",
    token: lost.customer.accessToken,
    body: lost.body,
  });
  const retryReturnedId = retry.data?.order?.id;
  if (retryReturnedId) await rememberOrderIds(manifest, [retryReturnedId]);
  const afterRetryIds = await waitForCaseOrderIds(prisma, lost.customer.userId, lost.marker);
  await rememberOrderIds(manifest, afterRetryIds);
  const afterRetry = reconcileCheckoutAfterUncertainty(afterRetryIds);
  validateRecoveredCheckout(afterRetry);
  if (afterRetry.kind !== "ONE_ORDER") {
    throw new Error(`lost-response retry: expected one authoritative order, received ${afterRetry.kind}`);
  }
  if (retry.ok) {
    throw new Error("lost-response retry unexpectedly succeeded after the original checkout already completed");
  }
  const lostResponseRetry: ApiRecoveryScenarioResult["lostResponseRetry"] = {
    transportOutcome: lostInitial.transportOutcome,
    state: afterRetry,
    retryStatus: retry.status,
  };

  const transitionCase = await prepareCheckoutCase(config, manifest, options, base + 3, "delayed-transition");
  const transitionOrderId = await performCheckout(config, transitionCase.customer.accessToken, transitionCase.body);
  await rememberOrderIds(manifest, [transitionOrderId]);
  const transitionResponse = await qaRequest<{
    success?: boolean;
    message?: string;
    order?: { id?: string; status?: string };
  }>(config, `/api/restaurant/orders/${transitionOrderId}/status`, {
    method: "PATCH",
    token: options.staffToken,
    body: { status: "ACCEPTED" },
  });
  const transitionData = expectQaSuccess(transitionResponse, "API recovery delayed transition");
  await delayRequest(150);
  if (transitionData.order?.id !== transitionOrderId) {
    throw new Error("API recovery delayed transition returned the wrong order");
  }

  const authoritativeTransition = await prisma.order.findUnique({
    where: { id: transitionOrderId },
    select: { status: true },
  });
  if (authoritativeTransition?.status !== "PREPARING") {
    throw new Error(
      `API recovery delayed transition expected PREPARING, received ${authoritativeTransition?.status ?? "missing"}`,
    );
  }

  const syntheticReadStatus = 500 as const;
  const recoveredRead = await qaRequest<CustomerOrderResponse>(config, `/api/orders/${transitionOrderId}`, {
    token: transitionCase.customer.accessToken,
  });
  const recoveredData = expectQaSuccess(recoveredRead, "API recovery read after synthetic 500");
  if (recoveredData.order?.id !== transitionOrderId || recoveredData.order.status !== "PREPARING") {
    throw new Error("API recovery read did not reconcile to authoritative PREPARING state");
  }

  return {
    delayedCheckout,
    timeoutCheckout,
    lostResponseRetry,
    delayedTransition: {
      orderId: transitionOrderId,
      finalStatus: authoritativeTransition.status,
      syntheticReadStatus,
      recoveredReadStatus: recoveredRead.status,
    },
  };
}
