import type { PrismaClient } from "@prisma/client";
import type {
  QaConfig,
  QaRunManifest,
  ProtectedSnapshot,
  SnapshotDiff,
} from "./types.js";
import { assertMutationConfirmation } from "./config.js";
import { writeJsonArtifact } from "./artifacts.js";
import { createEmptyManifest, createRunId, saveManifest } from "./manifest.js";
import { captureProtectedSnapshot, compareProtectedSnapshots } from "./snapshot.js";
import { executeCleanup, preflightCleanup, type CleanupResult } from "./cleanup.js";
import { createQaCatalogFixture, createQaOperatorFixture } from "./fixtures.js";
import {
  runApiRecoveryScenario,
  type ApiRecoveryScenarioResult,
} from "./resilience/apiRecovery.js";

export type TransportRecoveryStepKind = "backend" | "browser";
export type TransportRecoveryGroup = "api";

export const TRANSPORT_RECOVERY_GROUPS: TransportRecoveryGroup[] = ["api"];

export interface TransportRecoveryStep<T = unknown> {
  name: string;
  kind: TransportRecoveryStepKind;
  run: () => Promise<T>;
  cleanup: () => Promise<void>;
}

export interface TransportRecoveryStepResult<T = unknown> {
  name: string;
  kind: TransportRecoveryStepKind;
  status: "PASS";
  result: T;
}

export interface TransportRecoveryGroupSummary {
  group: TransportRecoveryGroup;
  runId: string;
  status: "PASS";
  result: ApiRecoveryScenarioResult;
  cleanup: CleanupResult;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function runTransportRecoverySequence<T>(
  steps: Array<TransportRecoveryStep<T>>,
): Promise<Array<TransportRecoveryStepResult<T>>> {
  const completed: Array<TransportRecoveryStepResult<T>> = [];

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
        throw new Error(
          `${step.name} failed: ${scenarioError.message}; cleanup also failed: ${cleanupError.message}`,
        );
      }
      throw scenarioError ?? cleanupError!;
    }

    completed.push({
      name: step.name,
      kind: step.kind,
      status: "PASS",
      result: result as T,
    });
  }

  return completed;
}

export function assertTransportCleanupAllowed(diff: SnapshotDiff[]): void {
  if (diff.length > 0) {
    throw new Error(
      `Protected staging configuration changed; transport recovery cleanup is blocked (${diff
        .map((item) => item.path)
        .join(", ")})`,
    );
  }
}

export function parseTransportRecoveryGroup(value: string | undefined): TransportRecoveryGroup {
  if (!value || !TRANSPORT_RECOVERY_GROUPS.includes(value as TransportRecoveryGroup)) {
    throw new Error(`Unknown transport recovery group: ${value ?? "<missing>"}`);
  }
  return value as TransportRecoveryGroup;
}

function transportRunId(group: TransportRecoveryGroup): string {
  return `${createRunId()}-transport-${group}`;
}

async function assertTransportStartsClean(
  prisma: PrismaClient,
  protectedBefore: ProtectedSnapshot,
): Promise<void> {
  const waiting = await prisma.order.count({
    where: {
      restaurantId: protectedBefore.restaurant.id,
      status: "WAITING_FOR_COURIER",
    },
  });
  if (waiting !== 0) {
    throw new Error(`Transport recovery cannot start with ${waiting} order(s) waiting for courier`);
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
  assertTransportCleanupAllowed(diff);
  return current;
}

async function cleanupTransportRecoveryGroup(
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

export async function runTransportRecoveryGroup(
  prisma: PrismaClient,
  config: QaConfig,
  group: TransportRecoveryGroup,
): Promise<TransportRecoveryGroupSummary> {
  assertMutationConfirmation(config);
  const manifest = createEmptyManifest(config, transportRunId(group));
  manifest.scenarioNames.push(`resilience-transport-${group}`);
  await saveManifest(manifest);

  const protectedBefore = await captureProtectedSnapshot(prisma);
  await writeJsonArtifact(manifest.runId, "protected-before", protectedBefore);
  await assertTransportStartsClean(prisma, protectedBefore);

  let cleanupResult: CleanupResult | null = null;
  let scenarioResult: ApiRecoveryScenarioResult | undefined;

  const step: TransportRecoveryStep<ApiRecoveryScenarioResult> = {
    name: group,
    kind: "backend",
    run: async () => {
      const catalog = await createQaCatalogFixture(prisma, config, manifest);
      const staff = await createQaOperatorFixture(prisma, config, manifest, "staff");
      scenarioResult = await runApiRecoveryScenario(prisma, config, manifest, {
        productId: catalog.productId,
        staffToken: staff.accessToken,
        restaurantLat: protectedBefore.restaurant.lat,
        restaurantLng: protectedBefore.restaurant.lng,
      });
      await writeJsonArtifact(manifest.runId, "transport-observation", {
        group,
        result: scenarioResult,
      });
      return scenarioResult;
    },
    cleanup: async () => {
      cleanupResult = await cleanupTransportRecoveryGroup(
        prisma,
        config,
        manifest,
        protectedBefore,
      );
    },
  };

  try {
    await runTransportRecoverySequence([step]);
    if (!scenarioResult) throw new Error(`${group}: scenario did not return a result`);
    if (!cleanupResult) throw new Error(`${group}: cleanup did not return a result`);
    const summary: TransportRecoveryGroupSummary = {
      group,
      runId: manifest.runId,
      status: "PASS",
      result: scenarioResult,
      cleanup: cleanupResult,
    };
    await writeJsonArtifact(manifest.runId, "transport-result", summary);
    return summary;
  } catch (error) {
    await writeJsonArtifact(manifest.runId, "transport-result", {
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
