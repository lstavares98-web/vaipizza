import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { ProtectedSnapshot } from "./types.js";
import { assertMutationConfirmation, assertSafeTarget, loadQaConfig } from "./config.js";
import { readJsonArtifact, writeJsonArtifact } from "./artifacts.js";
import { captureProtectedSnapshot, compareProtectedSnapshots } from "./snapshot.js";
import { assertRunId, loadManifest } from "./manifest.js";
import { cleanupMode, executeCleanup, preflightCleanup } from "./cleanup.js";
import { runFunctionalQa } from "./functional.js";
import { runLoadStageQa } from "./loadStageRunner.js";
import { parseBackendResilienceGroup, runBackendResilienceGroup } from "./resilienceRunner.js";

function snapshotRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `QA-SNAPSHOT-${stamp}`;
}

function readOption(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function runSnapshot(prisma: PrismaClient) {
  const runId = snapshotRunId();
  const snapshot = await captureProtectedSnapshot(prisma);
  const target = await writeJsonArtifact(runId, "protected-before", snapshot);
  console.log(`Protected staging snapshot written: ${target}`);
}

async function runCleanup(prisma: PrismaClient, config: ReturnType<typeof loadQaConfig>) {
  const runId = readOption("--run-id");
  if (!runId) throw new Error("cleanup requires --run-id=<QA run id>");
  assertRunId(runId);

  const manifest = await loadManifest(runId);
  if (manifest.apiHost !== config.apiHostname || manifest.supabaseProjectRef !== config.supabaseProjectRef) {
    throw new Error("Manifest target does not match the currently approved staging target");
  }

  const plan = await preflightCleanup(prisma, manifest);
  const mode = cleanupMode(hasFlag("--confirm-delete"));
  console.log(`Cleanup ${mode}: ${runId}; tracked ids=${
    plan.customerUserIds.length + plan.operatorUserIds.length + plan.courierUserIds.length + plan.courierIds.length + plan.addressIds.length +
    plan.productIds.length + plan.categoryIds.length + plan.orderIds.length
  }; already missing=${plan.missingIds.length}`);

  if (mode === "dry-run") {
    console.log("Dry-run only. No rows were deleted. Add --confirm-delete and the exact QA_CONFIRM token to execute.");
    return;
  }

  assertMutationConfirmation(config);
  const protectedBefore = await readJsonArtifact<ProtectedSnapshot>(runId, "protected-before");
  const preCleanupSnapshot = await captureProtectedSnapshot(prisma);
  const preCleanupDiff = compareProtectedSnapshots(protectedBefore, preCleanupSnapshot);
  await writeJsonArtifact(runId, "protected-precleanup", preCleanupSnapshot);
  await writeJsonArtifact(runId, "protected-precleanup-diff", preCleanupDiff);
  if (preCleanupDiff.length) {
    throw new Error("Protected configuration changed since this QA run started; cleanup deletion is blocked");
  }

  const result = await executeCleanup(prisma, plan, config);
  const protectedAfter = await captureProtectedSnapshot(prisma);
  const protectedDiff = compareProtectedSnapshots(protectedBefore, protectedAfter);
  await writeJsonArtifact(runId, "cleanup-result", result);
  await writeJsonArtifact(runId, "protected-after", protectedAfter);
  await writeJsonArtifact(runId, "protected-diff", protectedDiff);

  if (protectedDiff.length) {
    throw new Error("QA rows were removed, but protected configuration differs from the pre-run snapshot");
  }
  console.log(`Confirmed QA cleanup completed safely for ${runId}. Protected configuration is unchanged.`);
}

async function main() {
  const command = process.argv[2];
  const config = loadQaConfig(process.env);
  assertSafeTarget(config);
  const prisma = new PrismaClient();

  try {
    if (command === "snapshot") {
      await runSnapshot(prisma);
      return;
    }
    if (command === "functional") {
      assertMutationConfirmation(config);
      const result = await runFunctionalQa(prisma, config);
      console.log(`Functional QA PASS: ${result.runId}; order=${result.orderId}; status=${result.finalStatus}; cleanup complete.`);
      return;
    }
    if (command === "load") {
      assertMutationConfirmation(config);
      const stage = Number(readOption("--stage") ?? "10");
      if (!Number.isInteger(stage)) throw new Error("load requires an integer --stage");
      const result = await runLoadStageQa(prisma, config, stage);
      console.log(`Load QA PASS: ${result.runId}; stage=${result.stage}; delivered=${result.delivered}; outOfRange=${result.outOfRange}; cleanup complete.`);
      return;
    }
    if (command === "resilience-backend") {
      assertMutationConfirmation(config);
      const group = parseBackendResilienceGroup(readOption("--group"));
      const result = await runBackendResilienceGroup(prisma, config, group);
      console.log(`Backend resilience QA PASS: ${result.runId}; group=${result.group}; cleanup complete.`);
      return;
    }
    if (command === "cleanup") {
      await runCleanup(prisma, config);
      return;
    }
    throw new Error(`QA command is not implemented yet: ${command ?? "<missing>"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown QA runner error";
  console.error(`QA runner stopped: ${message}`);
  process.exitCode = 1;
});
