import type { PrismaClient } from "@prisma/client";
import type { ProtectedSnapshot, QaConfig, QaRunManifest } from "./types.js";
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
import { runSingleDeliveryTransitions, singleDeliveryCheckoutBody } from "./scenarios/singleDelivery.js";
import { qaRequest } from "./http.js";
import { executeCleanup, preflightCleanup, type CleanupResult } from "./cleanup.js";
import { assertFunctionalDeliveredState, runWithGuaranteedCleanup } from "./functional.js";
import { buildLoadCases, summarizeDurations } from "./load.js";
import {
  assertLiveLoadStageEnabled,
  assertLoadStagePreflight,
  classifyLoadCheckout,
  refreshLoadCourierLocation,
  runLoadCasesSequentially,
  validateLoadStageOutcomes,
  type QaLoadCaseOutcome,
} from "./loadStage.js";

export interface QaLoadStageSummary {
  runId: string;
  stage: number;
  totalCases: number;
  delivered: number;
  outOfRange: number;
  outcomes: QaLoadCaseOutcome[];
  metrics: {
    checkout: ReturnType<typeof summarizeDurations>;
    deliveryLifecycle: ReturnType<typeof summarizeDurations>;
  };
  cleanup: CleanupResult;
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
    throw new Error(`Protected staging configuration changed during load QA (${artifactPrefix}); cleanup is blocked`);
  }
}

async function cleanupLoadRun(
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

function rememberOrderId(manifest: QaRunManifest, orderId: string) {
  if (!manifest.orderIds.includes(orderId)) manifest.orderIds.push(orderId);
}

export async function runLoadStageQa(
  prisma: PrismaClient,
  config: QaConfig,
  stage: number,
): Promise<QaLoadStageSummary> {
  assertMutationConfirmation(config);
  assertLiveLoadStageEnabled(stage);

  const protectedBefore = await captureProtectedSnapshot(prisma);
  const waitingOrders = await prisma.order.count({
    where: { restaurantId: protectedBefore.restaurant.id, status: "WAITING_FOR_COURIER" },
  });
  assertLoadStagePreflight(stage, waitingOrders);

  const cases = buildLoadCases(stage, protectedBefore.restaurant.deliveryRadiusKm);
  const manifest = createEmptyManifest(config);
  manifest.scenarioNames.push(`load-${stage}`);
  await saveManifest(manifest);
  await writeJsonArtifact(manifest.runId, "protected-before", protectedBefore);
  await writeJsonArtifact(manifest.runId, "load-cases", cases);

  const checkoutDurations: number[] = [];
  const lifecycleDurations: number[] = [];
  let cleanupResult: CleanupResult | null = null;
  let observedOutcomes: QaLoadCaseOutcome[] = [];

  try {
    const scenario = await runWithGuaranteedCleanup(
      async () => {
        const catalog = await createQaCatalogFixture(prisma, config, manifest);
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

        observedOutcomes = await runLoadCasesSequentially(cases, async (testCase) => {
          const heartbeatMs = await refreshLoadCourierLocation(
            config,
            courierToken,
            protectedBefore.restaurant.lat,
            protectedBefore.restaurant.lng,
          );
          manifest.timings[`case-${testCase.index}.courier GPS heartbeat`] = heartbeatMs;

          const customer = await createQaCustomer(config, manifest, testCase.index);
          const point = pointAtDistanceKm(
            protectedBefore.restaurant.lat,
            protectedBefore.restaurant.lng,
            testCase.distanceKm,
            (testCase.index * 37) % 360,
          );
          const addressId = await createQaAddress(config, manifest, customer.accessToken, {
            labelSuffix: `${testCase.distanceKm}km`,
            line1: `[QA ${manifest.runId}] caso ${testCase.index} a ${testCase.distanceKm} km`,
            city: "Braga",
            postalCode: "4700-000",
            lat: point.lat,
            lng: point.lng,
            isDefault: true,
          });
          await addQaProductToCart(config, customer.accessToken, catalog.productId, 1);

          const checkoutResponse = await qaRequest<{
            success?: boolean;
            code?: string;
            message?: string;
            order?: { id?: string; status?: string };
          }>(config, "/api/orders", {
            method: "POST",
            token: customer.accessToken,
            body: singleDeliveryCheckoutBody(addressId, manifest.runId),
          });
          checkoutDurations.push(checkoutResponse.durationMs);
          manifest.timings[`case-${testCase.index}.checkout`] = checkoutResponse.durationMs;

          // Track any order returned by the API before classification. If an outside
          // case is incorrectly accepted, cleanup still owns the unexpected order.
          const returnedOrderId = checkoutResponse.data?.order?.id;
          if (returnedOrderId) {
            rememberOrderId(manifest, returnedOrderId);
            await saveManifest(manifest);
          }

          const checkout = classifyLoadCheckout(testCase, checkoutResponse);
          if (checkout.outcome === "OUT_OF_RANGE") {
            await saveManifest(manifest);
            return { index: testCase.index, outcome: "OUT_OF_RANGE" as const };
          }

          rememberOrderId(manifest, checkout.orderId);
          await saveManifest(manifest);

          const lifecycleStarted = performance.now();
          const transitions = await runSingleDeliveryTransitions(
            config,
            checkout.orderId,
            {
              staffToken: staff.accessToken,
              kitchenToken: kitchen.accessToken,
              courierToken,
            },
          );
          const lifecycleMs = performance.now() - lifecycleStarted;
          lifecycleDurations.push(lifecycleMs);
          manifest.timings[`case-${testCase.index}.lifecycle`] = lifecycleMs;
          for (const [name, duration] of Object.entries(transitions.timings)) {
            manifest.timings[`case-${testCase.index}.${name}`] = duration;
          }
          await saveManifest(manifest);

          const customerOrderResponse = await qaRequest<{
            success: boolean;
            order: { id: string; status: string; paymentStatus: string };
            message?: string;
          }>(config, `/api/orders/${checkout.orderId}`, { token: customer.accessToken });
          if (!customerOrderResponse.ok || customerOrderResponse.data.success === false) {
            throw new Error(`QA load case ${testCase.index} could not verify customer order`);
          }

          const historyResponse = await qaRequest<{
            success: boolean;
            orders: Array<{ id: string; status: string }>;
            message?: string;
          }>(config, "/api/courier/history", { token: courierToken });
          if (!historyResponse.ok || historyResponse.data.success === false) {
            throw new Error(`QA load case ${testCase.index} could not verify courier history`);
          }

          const earningsResponse = await qaRequest<{
            success: boolean;
            lifetimeDeliveries: number;
            today: { deliveries: number; total: number };
            message?: string;
          }>(config, "/api/courier/earnings", { token: courierToken });
          if (!earningsResponse.ok || earningsResponse.data.success === false) {
            throw new Error(`QA load case ${testCase.index} could not verify courier earnings`);
          }

          assertFunctionalDeliveredState({
            orderId: checkout.orderId,
            customerOrder: customerOrderResponse.data.order,
            courierHistory: historyResponse.data.orders,
            courierEarnings: earningsResponse.data,
          });

          const waitingAfterCase = await prisma.order.count({
            where: { restaurantId: protectedBefore.restaurant.id, status: "WAITING_FOR_COURIER" },
          });
          if (waitingAfterCase !== 0) {
            throw new Error(`QA load case ${testCase.index} left ${waitingAfterCase} order(s) waiting for courier`);
          }

          return { index: testCase.index, outcome: "DELIVERED" as const };
        });

        validateLoadStageOutcomes(cases, observedOutcomes);
        const metrics = {
          checkout: summarizeDurations(checkoutDurations),
          deliveryLifecycle: summarizeDurations(lifecycleDurations),
        };
        await writeJsonArtifact(manifest.runId, "load-observation", {
          stage,
          outcomes: observedOutcomes,
          delivered: observedOutcomes.filter((item) => item.outcome === "DELIVERED").length,
          outOfRange: observedOutcomes.filter((item) => item.outcome === "OUT_OF_RANGE").length,
          metrics,
          timings: manifest.timings,
        });
        return { outcomes: observedOutcomes, metrics };
      },
      async () => {
        cleanupResult = await cleanupLoadRun(prisma, config, manifest, protectedBefore);
      },
    );

    if (!cleanupResult) throw new Error("QA load cleanup did not return a result");
    const summary: QaLoadStageSummary = {
      runId: manifest.runId,
      stage,
      totalCases: cases.length,
      delivered: scenario.outcomes.filter((item) => item.outcome === "DELIVERED").length,
      outOfRange: scenario.outcomes.filter((item) => item.outcome === "OUT_OF_RANGE").length,
      outcomes: scenario.outcomes,
      metrics: scenario.metrics,
      cleanup: cleanupResult,
    };
    await writeJsonArtifact(manifest.runId, "load-result", { ...summary, status: "PASS" });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJsonArtifact(manifest.runId, "load-result", {
      runId: manifest.runId,
      stage,
      status: "FAIL",
      error: message,
      outcomes: observedOutcomes,
      cleanup: cleanupResult,
      metrics: {
        checkout: summarizeDurations(checkoutDurations),
        deliveryLifecycle: summarizeDurations(lifecycleDurations),
      },
      timings: manifest.timings,
    });
    throw error;
  }
}
