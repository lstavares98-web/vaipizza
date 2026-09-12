import type { QaLoadCase } from "./load.js";

export type QaLoadOutcome = "DELIVERED" | "OUT_OF_RANGE";

export interface QaLoadCaseOutcome {
  index: number;
  outcome: QaLoadOutcome;
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
