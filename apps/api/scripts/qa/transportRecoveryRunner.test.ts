import { describe, expect, it } from "vitest";
import {
  assertTransportCleanupAllowed,
  parseTransportRecoveryGroup,
  runTransportRecoverySequence,
  type TransportRecoveryStep,
} from "./transportRecoveryRunner.js";

describe("transport recovery sequencing", () => {
  it("stops on the first invariant failure, cleans it exactly once, and does not start browser work", async () => {
    const events: string[] = [];
    const steps: TransportRecoveryStep[] = [
      {
        name: "api",
        kind: "backend",
        run: async () => { events.push("run-api"); throw new Error("api-invariant"); },
        cleanup: async () => { events.push("clean-api"); },
      },
      {
        name: "browser",
        kind: "browser",
        run: async () => { events.push("run-browser"); return { ok: true }; },
        cleanup: async () => { events.push("clean-browser"); },
      },
    ];

    await expect(runTransportRecoverySequence(steps)).rejects.toThrow(/api-invariant/);
    expect(events).toEqual(["run-api", "clean-api"]);
  });

  it("cleans a successful mutating step before starting the next step", async () => {
    const events: string[] = [];
    const result = await runTransportRecoverySequence([
      {
        name: "api",
        kind: "backend",
        run: async () => { events.push("run-api"); return { ok: true }; },
        cleanup: async () => { events.push("clean-api"); },
      },
      {
        name: "browser",
        kind: "browser",
        run: async () => { events.push("run-browser"); return { ok: true }; },
        cleanup: async () => { events.push("clean-browser"); },
      },
    ]);

    expect(events).toEqual(["run-api", "clean-api", "run-browser", "clean-browser"]);
    expect(result.map((item) => item.status)).toEqual(["PASS", "PASS"]);
  });
});

describe("transport cleanup protected-state gate", () => {
  it("blocks destructive cleanup when protected staging configuration drifted", () => {
    expect(() => assertTransportCleanupAllowed([])).not.toThrow();
    expect(() => assertTransportCleanupAllowed([
      { path: "restaurant.courierDispatchRadiusKm", before: 12, after: 15 },
    ])).toThrow(/protected|cleanup|blocked/i);
  });
});

describe("transport recovery group parsing", () => {
  it("accepts the API recovery group and rejects unknown groups", () => {
    expect(parseTransportRecoveryGroup("api")).toBe("api");
    expect(() => parseTransportRecoveryGroup(undefined)).toThrow(/unknown|missing/i);
    expect(() => parseTransportRecoveryGroup("production")).toThrow(/unknown|production/i);
  });
});
