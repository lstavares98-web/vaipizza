import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertSafeTarget, loadQaConfig } from "./config.js";
import { writeJsonArtifact } from "./artifacts.js";
import { captureProtectedSnapshot } from "./snapshot.js";

function snapshotRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `QA-SNAPSHOT-${stamp}`;
}

async function main() {
  const command = process.argv[2];
  const config = loadQaConfig(process.env);
  assertSafeTarget(config);

  if (command !== "snapshot") {
    throw new Error(`QA command is not implemented yet: ${command ?? "<missing>"}`);
  }

  const prisma = new PrismaClient();
  try {
    const runId = snapshotRunId();
    const snapshot = await captureProtectedSnapshot(prisma);
    const target = await writeJsonArtifact(runId, "protected-before", snapshot);
    console.log(`Protected staging snapshot written: ${target}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown QA runner error";
  console.error(`QA runner stopped: ${message}`);
  process.exitCode = 1;
});
