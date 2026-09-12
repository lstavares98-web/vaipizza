import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest, ProtectedSnapshot, SnapshotDiff } from "./types.js";
import { assertMutationConfirmation } from "./config.js";
import { writeJsonArtifact } from "./artifacts.js";
import { createEmptyManifest, createRunId, saveManifest } from "./manifest.js";
import { captureProtectedSnapshot, compareProtectedSnapshots } from "./snapshot.js";
import { executeCleanup, preflightCleanup, type CleanupResult } from "./cleanup.js";
import {
  createQaCatalogFixture,
  createQaOperatorFixture,
} from "./fixtures.js";
import { runConcurrentCheckoutScenario } from "./resilience/concurrentCheckout.js";
import { runCourierAcceptanceRace } from "./resilience/courierRace.js";
import { runDispatchModeScenario } from "./resilience/dispatchModes.js";
import { runDuplicateActionScenario } from "./resilience/idempotency.js";

export type BackendResilienceGroup =
  | "concurrent"
  | "courier-race-2"
  | "courier-race-3"
  | "dispatch"
  | "idempotency";

export const BACKEND_RESILIENCE_GROUPS: BackendResilienceGroup[] = [
  "concurrent",
  "courier-race-2",
  "courier-race-3",
  "dispatch",
  "idempotency",
];

export interface ResilienceGroupStep<T = unknown> {
  name: string;
  run: () => Promise<T>;
  cleanup: () => Promise<void>;
}

export interface ResilienceGroupSequenceResult<T = unknown> {
  name: string;
  status: "PASS";
  result: T;
}

export interface BackendResilienceGroupSummary {
  group: BackendResilienceGroup;
  runId: string;
  status: "PASS";
  result: unknown;
  cleanup: CleanupResult;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function runResilienceGroupSequence<T>(
  steps: Array<ResilienceGroupStep<T>>,
): Promise<Array<ResilienceGroupSequenceResult<T>>> {
  const completed: Array<ResilienceGroupSequenceResult<T>> = [];

  for (const step of steps) {
    let result: T | undefined;
    let scenarioError: Error | null = null;
    let cleanupError: Error | null = null;

    try {
      result = await step.run();
    } catch (error) {
      scenarioError = asError(error);
    }

    try {
      await step.cleanup();
    } catch (error) {
      cleanupError = asError(error);
    }

    if (scenarioError || cleanupError) {
      if (scenarioError && cleanupError) {
        throw new Error(`${step.name} failed: ${scenarioError.message}; cleanup also failed: ${cleanupError.message}`);
      }
      throw scenarioError ?? cleanupError!;
    }

    completed.push({ name: step.name, status: "PASS", result: result as T });
  }

  return completed;
}

export function assertResilienceCleanupAllowed(diff: SnapshotDiff[]): void {
  if (diff.length > 0) {
    throw new Error(`Protected staging configuration changed; resilience cleanup is blocked (${diff.map((item) => item.path).join(", ")})`);
  }
}

function groupRunId(group: BackendResilienceGroup): string {
  return `${createRunId()}-${group}`;
}

async function assertDispatchQueueStartsEmpty(prisma: PrismaClient, protectedBefore: ProtectedSnapshot): Promise<void> {
  const waiting = await prisma.order.count({
    where: {
      restaurantId: protectedBefore.restaurant.id,
      status: "WAITING_FOR_COURIER",
    },
  });
  if (waiting !== 0) {
    throw new Error(`Backend resilience cannot start with ${waiting} order(s) waiting for courier`);
  }
}

async function captureAndAssertProtected(
  prisma: PrismaClient,
  manifest: QaRunManifest,
  before: ProtectedSnapshot,
  label: string,
): Promise<ProtectedSnapshot> {
  const current = await captureProtectedSnapshot(prisma);
  const diff = compareProtectedSnapshots(before, current);
  await writeJsonArtifact(manifest.runId, `${label}-snapshot`, current);
  await writeJsonArtifact(manifest.runId, `${label}-diff`, diff);
  assertResilienceCleanupAllowed(diff);
  return current;
}

async function cleanupBackendResilienceGroup(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  protectedBefore: ProtectedSnapshot,
): Promise<CleanupResult> {
  await captureAndAssertProtected(prisma, manifest, protectedBefore, "protected-precleanup");
  const plan = await preflightCleanup(prisma, manifest);
  await writeJsonArtifact(manifest.runId, "cleanup-plan", plan);
  const result = await executeCleanup(prisma, plan, config);
  await writeJsonArtifact(manifest.runId, "cleanup-result", result);
  await captureAndAssertProtected(prisma, manifest, protectedBefore, "protected-after");
  return result;
}

async function executeBackendScenario(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  protectedBefore: ProtectedSnapshot,
  group: BackendResilienceGroup,
): Promise<unknown> {
  const catalog = await createQaCatalogFixture(prisma, config, manifest);

  if (group === "concurrent") {
    return runConcurrentCheckoutScenario(prisma, config, manifest, {
      productId: catalog.productId,
      restaurantLat: protectedBefore.restaurant.lat,
      restaurantLng: protectedBefore.restaurant.lng,
      deliveryRadiusKm: protectedBefore.restaurant.deliveryRadiusKm,
      distinctCustomerCount: 2,
      customerIndexBase: 100_000,
    });
  }

  const staff = await createQaOperatorFixture(prisma, config, manifest, "staff");
  const kitchen = await createQaOperatorFixture(prisma, config, manifest, "kitchen");

  if (group === "courier-race-2" || group === "courier-race-3") {
    return runCourierAcceptanceRace(prisma, config, manifest, {
      productId: catalog.productId,
      staffToken: staff.accessToken,
      kitchenToken: kitchen.accessToken,
      restaurantLat: protectedBefore.restaurant.lat,
      restaurantLng: protectedBefore.restaurant.lng,
      courierCount: group === "courier-race-2" ? 2 : 3,
      customerIndex: group === "courier-race-2" ? 200_000 : 210_000,
      courierIndexBase: group === "courier-race-2" ? 100 : 200,
    });
  }

  if (group === "dispatch") {
    return runDispatchModeScenario(prisma, config, manifest, {
      productId: catalog.productId,
      staffToken: staff.accessToken,
      kitchenToken: kitchen.accessToken,
      restaurantLat: protectedBefore.restaurant.lat,
      restaurantLng: protectedBefore.restaurant.lng,
      dispatchRadiusKm: protectedBefore.restaurant.courierDispatchRadiusKm,
      customerIndexBase: 300_000,
      courierIndexBase: 1_000,
    });
  }

  return runDuplicateActionScenario(prisma, config, manifest, {
    productId: catalog.productId,
    staffToken: staff.accessToken,
    kitchenToken: kitchen.accessToken,
    restaurantLat: protectedBefore.restaurant.lat,
    restaurantLng: protectedBefore.restaurant.lng,
    customerIndex: 400_000,
    courierIndex: 4_000,
  });
}

export function parseBackendResilienceGroup(value: string | undefined): BackendResilienceGroup {
  if (!value || !BACKEND_RESILIENCE_GROUPS.includes(value as BackendResilienceGroup)) {
    throw new Error(`Unknown backend resilience group: ${value ?? "<missing>"}`);
  }
  return value as BackendResilienceGroup;
}

export async function runBackendResilienceGroup(
  prisma: PrismaClient,
  config: QaConfig,
  group: BackendResilienceGroup,
): Promise<BackendResilienceGroupSummary> {
  assertMutationConfirmation(config);
  const manifest = createEmptyManifest(config, groupRunId(group));
  manifest.scenarioNames.push(`resilience-backend-${group}`);
  await saveManifest(manifest);

  const protectedBefore = await captureProtectedSnapshot(prisma);
  await writeJsonArtifact(manifest.runId, "protected-before", protectedBefore);
  await assertDispatchQueueStartsEmpty(prisma, protectedBefore);

  let cleanupResult: CleanupResult | null = null;
  let scenarioResult: unknown;

  const step: ResilienceGroupStep<unknown> = {
    name: group,
    run: async () => {
      scenarioResult = await executeBackendScenario(prisma, config, manifest, protectedBefore, group);
      await writeJsonArtifact(manifest.runId, "resilience-observation", {
        group,
        result: scenarioResult,
      });
      return scenarioResult;
    },
    cleanup: async () => {
      cleanupResult = await cleanupBackendResilienceGroup(prisma, config, manifest, protectedBefore);
    },
  };

  try {
    await runResilienceGroupSequence([step]);
    if (!cleanupResult) throw new Error(`${group}: cleanup did not return a result`);
    const summary: BackendResilienceGroupSummary = {
      group,
      runId: manifest.runId,
      status: "PASS",
      result: scenarioResult,
      cleanup: cleanupResult,
    };
    await writeJsonArtifact(manifest.runId, "resilience-result", summary);
    return summary;
  } catch (error) {
    await writeJsonArtifact(manifest.runId, "resilience-result", {
      group,
      runId: manifest.runId,
      status: "FAIL",
      error: asError(error).message,
      result: scenarioResult ?? null,
      cleanup: cleanupResult,
    });
    throw error;
  }
}
