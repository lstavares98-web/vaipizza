import type { QaConfig, QaRunManifest } from "./types.js";
import { readJsonArtifact, writeJsonArtifact } from "./artifacts.js";

const RUN_ID_PATTERN = /^QA-\d{8}-\d{6}(?:-[A-Za-z0-9_-]+)?$/;
const ID_ARRAY_KEYS = [
  "customerUserIds",
  "courierUserIds",
  "courierIds",
  "addressIds",
  "categoryIds",
  "productIds",
  "orderIds",
] as const;

export function createRunId(now = new Date()): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `QA-${y}${mo}${d}-${h}${mi}${s}`;
}

export function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid QA run id: ${runId}`);
  }
}

export function qaEmail(runId: string, index: number): string {
  assertRunId(runId);
  if (!Number.isInteger(index) || index < 0) throw new Error("QA email index must be a non-negative integer");
  return `qa+${runId}-${index}@vaipizza.test`;
}

export function qaCourierEmail(runId: string, index: number): string {
  assertRunId(runId);
  if (!Number.isInteger(index) || index < 0) throw new Error("QA courier index must be a non-negative integer");
  return `qa+${runId}-courier-${index}@vaipizza.test`;
}

export function qaOperatorEmail(runId: string, kind: "staff" | "kitchen"): string {
  assertRunId(runId);
  return `qa+${runId}-operator-${kind}@vaipizza.test`;
}

export function createEmptyManifest(config: QaConfig, runId = createRunId()): QaRunManifest {
  assertRunId(runId);
  return {
    runId,
    createdAt: new Date().toISOString(),
    environment: "staging",
    apiHost: config.apiHostname,
    supabaseProjectRef: config.supabaseProjectRef,
    scenarioNames: [],
    customerUserIds: [],
    courierUserIds: [],
    courierIds: [],
    addressIds: [],
    categoryIds: [],
    productIds: [],
    orderIds: [],
    timings: {},
  };
}

function assertIdArray(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} contains an empty id`);
    if (seen.has(value)) throw new Error(`${label} contains a duplicate id: ${value}`);
    seen.add(value);
  }
}

export function validateManifest(manifest: QaRunManifest): void {
  assertRunId(manifest.runId);
  if (manifest.environment !== "staging") throw new Error("QA manifest must be staging-only");
  if (!manifest.apiHost.includes("staging")) throw new Error("QA manifest API host must be staging");
  if (!manifest.supabaseProjectRef) throw new Error("QA manifest is missing Supabase project ref");
  for (const key of ID_ARRAY_KEYS) assertIdArray(manifest[key], key);
  for (const name of manifest.scenarioNames) {
    if (!name.trim()) throw new Error("QA manifest contains an empty scenario name");
  }
}

export function manifestForPersistence(manifest: QaRunManifest): QaRunManifest {
  validateManifest(manifest);
  return {
    runId: manifest.runId,
    createdAt: manifest.createdAt,
    environment: "staging",
    apiHost: manifest.apiHost,
    supabaseProjectRef: manifest.supabaseProjectRef,
    scenarioNames: [...manifest.scenarioNames],
    customerUserIds: [...manifest.customerUserIds],
    courierUserIds: [...manifest.courierUserIds],
    courierIds: [...manifest.courierIds],
    addressIds: [...manifest.addressIds],
    categoryIds: [...manifest.categoryIds],
    productIds: [...manifest.productIds],
    orderIds: [...manifest.orderIds],
    timings: { ...manifest.timings },
  };
}

export async function saveManifest(manifest: QaRunManifest): Promise<string> {
  return writeJsonArtifact(manifest.runId, "manifest", manifestForPersistence(manifest));
}

export async function loadManifest(runId: string): Promise<QaRunManifest> {
  assertRunId(runId);
  const manifest = await readJsonArtifact<QaRunManifest>(runId, "manifest");
  validateManifest(manifest);
  if (manifest.runId !== runId) throw new Error("Manifest run id does not match requested run id");
  return manifest;
}
