import { describe, expect, it } from "vitest";
import { buildLoadCases, LOAD_STAGES, nextLoadStage, summarizeDurations } from "./load.js";

describe("QA load progression", () => {
  it("uses the approved progressive stages", () => {
    expect(LOAD_STAGES).toEqual([10, 50, 100, 250]);
  });

  it("never advances after a failed stage", () => {
    expect(nextLoadStage(10, false)).toBeNull();
    expect(nextLoadStage(50, false)).toBeNull();
  });

  it("advances only to the next approved stage", () => {
    expect(nextLoadStage(10, true)).toBe(50);
    expect(nextLoadStage(50, true)).toBe(100);
    expect(nextLoadStage(100, true)).toBe(250);
    expect(nextLoadStage(250, true)).toBeNull();
  });
});

describe("QA load geographic mix", () => {
  it("makes 80 percent in-range and 20 percent out-of-range for a 10-order batch", () => {
    const cases = buildLoadCases(10, 8);
    expect(cases).toHaveLength(10);
    expect(cases.filter((item) => item.expectedCheckout === "ACCEPT")).toHaveLength(8);
    expect(cases.filter((item) => item.expectedCheckout === "OUT_OF_RANGE")).toHaveLength(2);
  });

  it("places boundary cases immediately inside and outside the configured radius", () => {
    const cases = buildLoadCases(10, 8);
    expect(cases.some((item) => item.kind === "edge-inside" && item.distanceKm === 7.9)).toBe(true);
    expect(cases.some((item) => item.kind === "edge-outside" && item.distanceKm === 8.1)).toBe(true);
  });

  it("never generates negative distances for very small radii", () => {
    const cases = buildLoadCases(10, 0.05);
    expect(cases.every((item) => item.distanceKm >= 0)).toBe(true);
  });
});

describe("QA load timing summary", () => {
  it("reports count, average, p50, p95 and max", () => {
    expect(summarizeDurations([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toEqual({
      count: 10,
      averageMs: 55,
      p50Ms: 50,
      p95Ms: 100,
      maxMs: 100,
    });
  });

  it("handles an empty sample without NaN", () => {
    expect(summarizeDurations([])).toEqual({ count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  });
});
