import { describe, expect, it } from "vitest";
import { buildLoadCases } from "./load.js";
import { validateLoadStageOutcomes } from "./loadStage.js";

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
