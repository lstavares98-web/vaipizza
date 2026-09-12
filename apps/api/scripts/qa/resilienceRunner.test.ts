import { describe, expect, it } from "vitest";
import {
  assertResilienceCleanupAllowed,
  runResilienceGroupSequence,
  type ResilienceGroupStep,
} from "./resilienceRunner.js";

describe("backend resilience group sequencing", () => {
  it("stops after the first failing group and still cleans that group exactly once", async () => {
    const events: string[] = [];
    const steps: ResilienceGroupStep[] = [
      {
        name: "one",
        run: async () => { events.push("run-one"); return { ok: true }; },
        cleanup: async () => { events.push("clean-one"); },
      },
      {
        name: "two",
        run: async () => { events.push("run-two"); throw new Error("boom-two"); },
        cleanup: async () => { events.push("clean-two"); },
      },
      {
        name: "three",
        run: async () => { events.push("run-three"); return { ok: true }; },
        cleanup: async () => { events.push("clean-three"); },
      },
    ];

    await expect(runResilienceGroupSequence(steps)).rejects.toThrow(/boom-two/);
    expect(events).toEqual([
      "run-one", "clean-one",
      "run-two", "clean-two",
    ]);
  });

  it("attempts cleanup exactly once when a group succeeds", async () => {
    let cleanupCalls = 0;
    const result = await runResilienceGroupSequence([{
      name: "one",
      run: async () => ({ value: 42 }),
      cleanup: async () => { cleanupCalls += 1; },
    }]);

    expect(cleanupCalls).toBe(1);
    expect(result).toEqual([{ name: "one", status: "PASS", result: { value: 42 } }]);
  });
});

describe("resilience cleanup protected-state gate", () => {
  it("allows cleanup only when protected snapshot diff is empty", () => {
    expect(() => assertResilienceCleanupAllowed([])).not.toThrow();
    expect(() => assertResilienceCleanupAllowed([
      { path: "restaurant.deliveryRadiusKm", before: 8, after: 9 },
    ])).toThrow(/protected|cleanup|blocked/i);
  });
});
