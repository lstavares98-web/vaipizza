import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest, ProtectedSnapshot } from "./types.js";
import { assertMutationConfirmation } from "./config.js";
import { writeJsonArtifact } from "./artifacts.js";
import { createEmptyManifest, saveManifest } from "./manifest.js";
import { captureProtectedSnapshot, compareProtectedSnapshots } from "./snapshot.js";
import {
  addQaProductToCart,
  createQaAddress,
  createQaCatalogFixture,
  createQaCourierFixture,
  createQaCustomer,
  createQaOperatorFixture,
  loginQaCourier,
} from "./fixtures.js";
import { pointAtDistanceKm } from "./scenarios/geo.js";
import {
  assertQaOrderStatus,
  runSingleDeliveryTransitions,
  singleDeliveryCheckoutBody,
} from "./scenarios/singleDelivery.js";
import { expectQaSuccess, qaRequest } from "./http.js";
import { executeCleanup, preflightCleanup, type CleanupResult } from "./cleanup.js";

export interface FunctionalDeliveredState {
  orderId: string;
  customerOrder: { id: string; status: string; paymentStatus: string };
  courierHistory: Array<{ id: string; status: string }>;
  courierEarnings: {
    lifetimeDeliveries: number;
    today: { deliveries: number; total: number };
  };
}

export interface FunctionalRunSummary {
  runId: string;
  orderId: string;
  finalStatus: "DELIVERED";
  timings: Record<string, number>;
  cleanup: CleanupResult;
}

export function assertFunctionalDeliveredState(state: FunctionalDeliveredState): void {
  if (state.customerOrder.id !== state.orderId) {
    throw new Error(`Functional QA returned the wrong customer order: ${state.customerOrder.id}`);
  }
  if (state.customerOrder.status !== "DELIVERED") {
    throw new Error(`Functional QA order is not DELIVERED: ${state.customerOrder.status}`);
  }
  if (state.customerOrder.paymentStatus !== "PAID") {
    throw new Error(`Functional QA cash payment is not PAID: ${state.customerOrder.paymentStatus}`);
  }
  if (!state.courierHistory.some((order) => order.id === state.orderId && order.status === "DELIVERED")) {
    throw new Error(`Functional QA order ${state.orderId} is missing from courier history`);
  }
  if (state.courierEarnings.lifetimeDeliveries < 1 || state.courierEarnings.today.deliveries < 1) {
    throw new Error("Functional QA delivery was not reflected in courier earnings");
  }
}

export function combineFunctionalAndCleanupErrors(
  scenarioError: Error | null,
  cleanupError: Error | null,
): Error {
  if (scenarioError && cleanupError) {
    return new Error(`Functional QA failed: ${scenarioError.message}; cleanup also failed: ${cleanupError.message}`);
  }
  if (scenarioError) return scenarioError;
  if (cleanupError) return cleanupError;
  return new Error("Functional QA failed without a reported error");
}

export async function runWithGuaranteedCleanup<T>(
  scenario: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let result: T | undefined;
  let scenarioError: Error | null = null;
  let cleanupError: Error | null = null;

  try {
    result = await scenario();
  } catch (error) {
    scenarioError = error instanceof Error ? error : new Error(String(error));
  }

  try {
    await cleanup();
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  }

  if (scenarioError || cleanupError) {
    throw combineFunctionalAndCleanupErrors(scenarioError, cleanupError);
  }
  return result as T;
}

async function assertProtectedUnchanged(
  prisma: PrismaClient,
  runId: string,
  before: ProtectedSnapshot,
  artifactPrefix: string,
): Promise<void> {
  const current = await captureProtectedSnapshot(prisma);
  const diff = compareProtectedSnapshots(before, current);
  await writeJsonArtifact(runId, `${artifactPrefix}-snapshot`, current);
  await writeJsonArtifact(runId, `${artifactPrefix}-diff`, diff);
  if (diff.length) {
    throw new Error(`Protected staging configuration changed during QA (${artifactPrefix}); destructive cleanup is blocked`);
  }
}

async function cleanupFunctionalRun(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  protectedBefore: ProtectedSnapshot,
): Promise<CleanupResult> {
  await assertProtectedUnchanged(prisma, manifest.runId, protectedBefore, "protected-precleanup");
  const plan = await preflightCleanup(prisma, manifest);
  await writeJsonArtifact(manifest.runId, "cleanup-plan", plan);
  const result = await executeCleanup(prisma, plan, config);
  await writeJsonArtifact(manifest.runId, "cleanup-result", result);
  await assertProtectedUnchanged(prisma, manifest.runId, protectedBefore, "protected-after");
  return result;
}

export async function runFunctionalQa(prisma: PrismaClient, config: QaConfig): Promise<FunctionalRunSummary> {
  assertMutationConfirmation(config);
  const manifest = createEmptyManifest(config);
  manifest.scenarioNames.push("single-delivery");
  await saveManifest(manifest);

  const protectedBefore = await captureProtectedSnapshot(prisma);
  await writeJsonArtifact(manifest.runId, "protected-before", protectedBefore);

  let cleanupResult: CleanupResult | null = null;
  let scenarioOrderId = "";

  try {
    const scenario = await runWithGuaranteedCleanup(
      async () => {
        const catalog = await createQaCatalogFixture(prisma, config, manifest);
        const customer = await createQaCustomer(config, manifest, 0);
        const staff = await createQaOperatorFixture(prisma, config, manifest, "staff");
        const kitchen = await createQaOperatorFixture(prisma, config, manifest, "kitchen");
        const courier = await createQaCourierFixture(prisma, config, manifest, {
          index: 0,
          status: "AVAILABLE",
          lat: protectedBefore.restaurant.lat,
          lng: protectedBefore.restaurant.lng,
          accuracyM: 10,
          locationUpdatedAt: new Date(),
        });
        const courierToken = await loginQaCourier(config, courier.email, courier.password);

        const deliveryPoint = pointAtDistanceKm(
          protectedBefore.restaurant.lat,
          protectedBefore.restaurant.lng,
          1,
          90,
        );
        const addressId = await createQaAddress(config, manifest, customer.accessToken, {
          labelSuffix: "1km",
          line1: `[QA ${manifest.runId}] endereço a 1 km`,
          city: "Braga",
          postalCode: "4700-000",
          lat: deliveryPoint.lat,
          lng: deliveryPoint.lng,
          isDefault: true,
        });

        await addQaProductToCart(config, customer.accessToken, catalog.productId, 1);
        const checkoutResponse = await qaRequest<{
          success: boolean;
          order: { id: string; status: string };
          message?: string;
        }>(config, "/api/orders", {
          method: "POST",
          token: customer.accessToken,
          body: singleDeliveryCheckoutBody(addressId, manifest.runId),
        });
        const checkoutData = expectQaSuccess(checkoutResponse, "QA checkout");
        if (!checkoutData.order?.id) throw new Error("QA checkout returned no order id");
        scenarioOrderId = checkoutData.order.id;
        manifest.orderIds.push(scenarioOrderId);
        manifest.timings.checkout = checkoutResponse.durationMs;
        await saveManifest(manifest);
        assertQaOrderStatus(checkoutData.order, "NEW", "QA checkout");

        const transitions = await runSingleDeliveryTransitions(
          config,
          scenarioOrderId,
          {
            staffToken: staff.accessToken,
            kitchenToken: kitchen.accessToken,
            courierToken,
          },
        );
        Object.assign(manifest.timings, transitions.timings);
        await saveManifest(manifest);

        const customerOrderResponse = await qaRequest<{
          success: boolean;
          order: { id: string; status: string; paymentStatus: string };
          message?: string;
        }>(config, `/api/orders/${scenarioOrderId}`, { token: customer.accessToken });
        const customerOrderData = expectQaSuccess(customerOrderResponse, "Verify customer delivered order");

        const historyResponse = await qaRequest<{
          success: boolean;
          orders: Array<{ id: string; status: string }>;
          message?: string;
        }>(config, "/api/courier/history", { token: courierToken });
        const historyData = expectQaSuccess(historyResponse, "Verify courier history");

        const earningsResponse = await qaRequest<{
          success: boolean;
          lifetimeDeliveries: number;
          today: { deliveries: number; total: number };
          message?: string;
        }>(config, "/api/courier/earnings", { token: courierToken });
        const earningsData = expectQaSuccess(earningsResponse, "Verify courier earnings");

        assertFunctionalDeliveredState({
          orderId: scenarioOrderId,
          customerOrder: customerOrderData.order,
          courierHistory: historyData.orders,
          courierEarnings: earningsData,
        });

        await writeJsonArtifact(manifest.runId, "functional-observation", {
          orderId: scenarioOrderId,
          finalStatus: customerOrderData.order.status,
          paymentStatus: customerOrderData.order.paymentStatus,
          historyContainsOrder: historyData.orders.some((order) => order.id === scenarioOrderId),
          courierLifetimeDeliveries: earningsData.lifetimeDeliveries,
          courierTodayDeliveries: earningsData.today.deliveries,
          timings: manifest.timings,
        });

        return { orderId: scenarioOrderId, finalStatus: "DELIVERED" as const, timings: { ...manifest.timings } };
      },
      async () => {
        cleanupResult = await cleanupFunctionalRun(prisma, config, manifest, protectedBefore);
      },
    );

    if (!cleanupResult) throw new Error("Functional QA cleanup did not return a result");
    const summary: FunctionalRunSummary = {
      runId: manifest.runId,
      orderId: scenario.orderId,
      finalStatus: scenario.finalStatus,
      timings: scenario.timings,
      cleanup: cleanupResult,
    };
    await writeJsonArtifact(manifest.runId, "functional-result", { ...summary, status: "PASS" });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJsonArtifact(manifest.runId, "functional-result", {
      runId: manifest.runId,
      orderId: scenarioOrderId || null,
      status: "FAIL",
      error: message,
      cleanup: cleanupResult,
      timings: manifest.timings,
    });
    throw error;
  }
}
