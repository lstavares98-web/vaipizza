import { describe, expect, it } from "vitest";
import { buildLoadCases } from "./load.js";
import {
  assertLoadStagePreflight,
  runLoadCasesSequentially,
  validateLoadStageOutcomes,
} from "./loadStage.js";

describe("QA load stage outcome validation", () => {
  it("accepts the approved 8 delivered + 2 out-of-range mix for stage 10", () => {
    const cases = buildLoadCases(10, 8);
    const outcomes = cases.map((item) => ({
      index: item.index,
      outcome: item.expectedCheckout === "ACCEPT" ? "DELIVERED" as const : "OUT_OF_RANGE" as const,
    }));
    expect(() => validateLoadStageOutcomes(cases, outcomes)).not.toThrow();
  });

  it("rejects an accepted address that never reached DELIVERED", () => {
    const cases = buildLoadCases(10, 8);
    const outcomes = cases.map((item) => ({
      index: item.index,
      outcome: item.expectedCheckout === "ACCEPT" ? "DELIVERED" as const : "OUT_OF_RANGE" as const,
    }));
    outcomes[0] = { index: 0, outcome: "OUT_OF_RANGE" };
    expect(() => validateLoadStageOutcomes(cases, outcomes)).toThrow(/case 0/i);
  });

  it("rejects an outside address that is incorrectly accepted", () => {
    const cases = buildLoadCases(10, 8);
    const outside = cases.find((item) => item.expectedCheckout === "OUT_OF_RANGE")!;
    const outcomes = cases.map((item) => ({
      index: item.index,
      outcome: item.expectedCheckout === "ACCEPT" ? "DELIVERED" as const : "OUT_OF_RANGE" as const,
    }));
    outcomes[outside.index] = { index: outside.index, outcome: "DELIVERED" };
    expect(() => validateLoadStageOutcomes(cases, outcomes)).toThrow(new RegExp(`case ${outside.index}`, "i"));
  });
});

describe("QA load stage preflight", () => {
  it("allows stage 10 only when the dispatch queue starts empty", () => {
    expect(() => assertLoadStagePreflight(10, 0)).not.toThrow();
  });

  it("refuses to start while an old order is waiting for courier", () => {
    expect(() => assertLoadStagePreflight(10, 1)).toThrow(/waiting/i);
  });

  it("refuses an unapproved stage", () => {
    expect(() => assertLoadStagePreflight(25, 0)).toThrow(/approved/i);
  });
});

describe("QA load stage sequencing", () => {
  it("finishes each case before starting the next one", async () => {
    const cases = buildLoadCases(10, 8).slice(0, 3);
    const events: string[] = [];
    const outcomes = await runLoadCasesSequentially(cases, async (testCase) => {
      events.push(`start-${testCase.index}`);
      await Promise.resolve();
      events.push(`finish-${testCase.index}`);
      return {
        index: testCase.index,
        outcome: testCase.expectedCheckout === "ACCEPT" ? "DELIVERED" as const : "OUT_OF_RANGE" as const,
      };
    });

    expect(outcomes).toHaveLength(3);
    expect(events).toEqual([
      "start-0", "finish-0",
      "start-1", "finish-1",
      "start-2", "finish-2",
    ]);
  });
});
