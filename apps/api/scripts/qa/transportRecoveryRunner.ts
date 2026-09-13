import type { SnapshotDiff } from "./types.js";

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
