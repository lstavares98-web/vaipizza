import { describe, expect, it } from "vitest";
import {
  assertTransportCleanupAllowed,
  parseTransportRecoveryGroup,
  runTransportRecoverySequence,
  runTransportRecoveryWorkflow,
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

describe("composed transport recovery workflow", () => {
  it("runs API first, then prepares browser data, then socket and refresh, then cleanup", async () => {
    const events: string[] = [];

    await runTransportRecoveryWorkflow({
      runApi: async () => { events.push("api"); },
      prepareBrowser: async () => { events.push("prepare"); },
      runSocketBrowser: async () => { events.push("socket"); },
      runRefreshBrowser: async () => { events.push("refresh"); },
      cleanupBrowser: async () => { events.push("cleanup"); },
    });

    expect(events).toEqual(["api", "prepare", "socket", "refresh", "cleanup"]);
  });

  it("does not prepare or start browser work when API preconditions fail", async () => {
    const events: string[] = [];

    await expect(runTransportRecoveryWorkflow({
      runApi: async () => { events.push("api"); throw new Error("api-precondition"); },
      prepareBrowser: async () => { events.push("prepare"); },
      runSocketBrowser: async () => { events.push("socket"); },
      runRefreshBrowser: async () => { events.push("refresh"); },
      cleanupBrowser: async () => { events.push("cleanup"); },
    })).rejects.toThrow(/api-precondition/);

    expect(events).toEqual(["api"]);
  });

  it("cleans the browser fixture when socket recovery fails and does not start refresh", async () => {
    const events: string[] = [];

    await expect(runTransportRecoveryWorkflow({
      runApi: async () => { events.push("api"); },
      prepareBrowser: async () => { events.push("prepare"); },
      runSocketBrowser: async () => { events.push("socket"); throw new Error("socket-failed"); },
      runRefreshBrowser: async () => { events.push("refresh"); },
      cleanupBrowser: async () => { events.push("cleanup"); },
    })).rejects.toThrow(/socket-failed/);

    expect(events).toEqual(["api", "prepare", "socket", "cleanup"]);
  });

  it("reports both browser failure and cleanup failure without hiding either", async () => {
    await expect(runTransportRecoveryWorkflow({
      runApi: async () => {},
      prepareBrowser: async () => {},
      runSocketBrowser: async () => {},
      runRefreshBrowser: async () => { throw new Error("refresh-failed"); },
      cleanupBrowser: async () => { throw new Error("cleanup-failed"); },
    })).rejects.toThrow(/refresh-failed.*cleanup.*cleanup-failed/i);
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
