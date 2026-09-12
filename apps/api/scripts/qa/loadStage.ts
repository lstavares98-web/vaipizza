import { LOAD_STAGES, type QaLoadCase, type QaLoadStage } from "./load.js";

export type QaLoadOutcome = "DELIVERED" | "OUT_OF_RANGE";

export interface QaLoadCaseOutcome {
  index: number;
  outcome: QaLoadOutcome;
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
