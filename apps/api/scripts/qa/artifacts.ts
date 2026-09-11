import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function assertSafeSegment(value: string, label: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${label} contains unsafe path characters`);
  }
}

export function qaArtifactRoot() {
  return process.env.QA_ARTIFACT_DIR
    ? path.resolve(process.env.QA_ARTIFACT_DIR)
    : path.join(repoRoot, "qa-artifacts");
}

export function qaRunArtifactDir(runId: string) {
  assertSafeSegment(runId, "runId");
  if (!runId.startsWith("QA-")) throw new Error("runId must start with QA-");
  return path.join(qaArtifactRoot(), runId);
}

export async function writeJsonArtifact(runId: string, name: string, value: unknown): Promise<string> {
  assertSafeSegment(name, "artifact name");
  const dir = qaRunArtifactDir(runId);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${name}.json`);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

export async function readJsonArtifact<T>(runId: string, name: string): Promise<T> {
  assertSafeSegment(name, "artifact name");
  const target = path.join(qaRunArtifactDir(runId), `${name}.json`);
  return JSON.parse(await readFile(target, "utf8")) as T;
}
