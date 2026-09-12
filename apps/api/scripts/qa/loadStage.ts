import type { QaConfig } from "./types.js";
import { qaRequest, type QaHttpResponse, type QaRequestOptions } from "./http.js";
import { LOAD_STAGES, type QaLoadCase, type QaLoadStage } from "./load.js";

const LIVE_LOAD_STAGES = [10, 50, 100] as const;

export type QaLoadOutcome = "DELIVERED" | "OUT_OF_RANGE";

export interface QaLoadCaseOutcome {
  index: number;
  outcome: QaLoadOutcome;
}

export type QaLoadCheckoutResult =
  | { outcome: "OUT_OF_RANGE" }
  | { outcome: "ACCEPT"; orderId: string };

export type QaLoadRequestExecutor = <T>(
  config: QaConfig,
  path: string,
  options?: QaRequestOptions,
) => Promise<QaHttpResponse<T>>;

type LoadCheckoutData = {
  success?: boolean;
  code?: string;
  message?: string;
  order?: { id?: string; status?: string };
};

type LoadCourierLocationData = {
  success?: boolean;
  message?: string;
};

export function assertLiveLoadStageEnabled(stage: number): void {
  if (!LIVE_LOAD_STAGES.includes(stage as (typeof LIVE_LOAD_STAGES)[number])) {
    throw new Error(`QA live load stage ${stage} is not enabled yet`);
  }
}

export async function refreshLoadCourierLocation(
  config: QaConfig,
  token: string,
  lat: number,
  lng: number,
  request: QaLoadRequestExecutor = qaRequest,
): Promise<number> {
  const response = await request<LoadCourierLocationData>(config, "/api/courier/location", {
    method: "POST",
    token,
    body: { lat, lng, accuracyM: 10 },
  });
  if (!response.ok || response.data?.success === false) {
    const message = response.data?.message ?? `HTTP ${response.status}`;
    throw new Error(`QA courier GPS heartbeat failed: ${message}`);
  }
  return response.durationMs;
}

export function classifyLoadCheckout(
  testCase: QaLoadCase,
  response: QaHttpResponse<LoadCheckoutData>,
): QaLoadCheckoutResult {
  if (testCase.expectedCheckout === "OUT_OF_RANGE") {
    if (!response.ok && response.data?.code === "OUT_OF_RANGE") {
      return { outcome: "OUT_OF_RANGE" };
    }
    const received = response.data?.code ?? `HTTP ${response.status}`;
    throw new Error(`QA load case ${testCase.index} expected OUT_OF_RANGE, received ${received}`);
  }

  if (!response.ok || response.data?.success === false) {
    const received = response.data?.code ?? response.data?.message ?? `HTTP ${response.status}`;
    throw new Error(`QA load case ${testCase.index} checkout failed: ${received}`);
  }
  const orderId = response.data?.order?.id;
  if (!orderId || response.data?.order?.status !== "NEW") {
    throw new Error(`QA load case ${testCase.index} accepted checkout did not return a NEW order id`);
  }
  return { outcome: "ACCEPT", orderId };
}

export function assertLoadStagePreflight(stage: number, waitingOrders: number): asserts stage is QaLoadStage {
  if (!LOAD_STAGES.includes(stage as QaLoadStage)) {
    throw new Error(`QA load stage ${stage} is not an approved stage`);
  }
  if (!Number.isInteger(waitingOrders) || waitingOrders < 0) {
    throw new Error("QA load waiting-order count is invalid");
  }
  if (waitingOrders !== 0) {
    throw new Error(`QA load stage cannot start with ${waitingOrders} waiting order(s) in dispatch`);
  }
}

export async function runLoadCasesSequentially(
  cases: QaLoadCase[],
  execute: (testCase: QaLoadCase) => Promise<QaLoadCaseOutcome>,
): Promise<QaLoadCaseOutcome[]> {
  const outcomes: QaLoadCaseOutcome[] = [];
  for (const testCase of cases) {
    outcomes.push(await execute(testCase));
  }
  return outcomes;
}

export function validateLoadStageOutcomes(cases: QaLoadCase[], outcomes: QaLoadCaseOutcome[]): void {
  if (outcomes.length !== cases.length) {
    throw new Error(`QA load stage returned ${outcomes.length} outcomes for ${cases.length} cases`);
  }

  const byIndex = new Map(outcomes.map((outcome) => [outcome.index, outcome]));
  for (const testCase of cases) {
    const outcome = byIndex.get(testCase.index);
    if (!outcome) throw new Error(`QA load case ${testCase.index} has no outcome`);

    const expected: QaLoadOutcome = testCase.expectedCheckout === "ACCEPT" ? "DELIVERED" : "OUT_OF_RANGE";
    if (outcome.outcome !== expected) {
      throw new Error(`QA load case ${testCase.index} expected ${expected}, received ${outcome.outcome}`);
    }
  }
}
