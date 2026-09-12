import { describe, expect, it } from "vitest";
import type { QaConfig } from "./types.js";
import type { QaAuthSession } from "./fixtures.js";
import type { QaHttpResponse, QaRequestOptions } from "./http.js";
import { buildLoadCases } from "./load.js";
import {
  assertLiveLoadStageEnabled,
  assertLoadStagePreflight,
  classifyLoadCheckout,
  refreshLoadAuthSessionsIfDue,
  refreshLoadCourierLocation,
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

describe("QA live load promotion gate", () => {
  it("enables 10, 50, 100 and 250 after stage 100 passed", () => {
    expect(() => assertLiveLoadStageEnabled(10)).not.toThrow();
    expect(() => assertLiveLoadStageEnabled(50)).not.toThrow();
    expect(() => assertLiveLoadStageEnabled(100)).not.toThrow();
    expect(() => assertLiveLoadStageEnabled(250)).not.toThrow();
  });

  it("keeps unapproved stages blocked", () => {
    expect(() => assertLiveLoadStageEnabled(500)).toThrow(/not enabled/i);
  });
});

describe("QA load authentication renewal", () => {
  const session = (name: string, refreshedAtMs: number): QaAuthSession => ({
    accessToken: `${name}-access`,
    refreshToken: `${name}-refresh`,
    refreshedAtMs,
  });

  it("refreshes staff, kitchen and courier sessions before 15-minute expiry", async () => {
    const calls: string[] = [];
    const refresher = async (
      _config: QaConfig,
      current: QaAuthSession,
    ): Promise<QaAuthSession> => {
      calls.push(current.accessToken);
      return {
        accessToken: `${current.accessToken}-new`,
        refreshToken: `${current.refreshToken}-new`,
        refreshedAtMs: 10 * 60_000,
      };
    };

    const result = await refreshLoadAuthSessionsIfDue(
      {} as QaConfig,
      {
        staff: session("staff", 0),
        kitchen: session("kitchen", 0),
        courier: session("courier", 0),
      },
      10 * 60_000,
      refresher,
    );

    expect(result.refreshed).toBe(true);
    expect(calls).toEqual(["staff-access", "kitchen-access", "courier-access"]);
    expect(result.sessions.staff.accessToken).toBe("staff-access-new");
    expect(result.sessions.kitchen.accessToken).toBe("kitchen-access-new");
    expect(result.sessions.courier.accessToken).toBe("courier-access-new");
  });

  it("does not refresh sessions that are still fresh", async () => {
    let calls = 0;
    const refresher = async (_config: QaConfig, current: QaAuthSession): Promise<QaAuthSession> => {
      calls += 1;
      return current;
    };

    const sessions = {
      staff: session("staff", 0),
      kitchen: session("kitchen", 0),
      courier: session("courier", 0),
    };
    const result = await refreshLoadAuthSessionsIfDue(
      {} as QaConfig,
      sessions,
      9 * 60_000,
      refresher,
    );

    expect(result).toEqual({ sessions, refreshed: false });
    expect(calls).toBe(0);
  });
});

describe("QA load courier GPS heartbeat", () => {
  it("renews the QA courier location through the real courier API", async () => {
    const calls: Array<{ path: string; options?: QaRequestOptions }> = [];
    const request = async <T>(
      _config: QaConfig,
      path: string,
      options?: QaRequestOptions,
    ): Promise<QaHttpResponse<T>> => {
      calls.push({ path, options });
      return { ok: true, status: 200, durationMs: 17, data: { success: true } as T };
    };

    const duration = await refreshLoadCourierLocation(
      {} as QaConfig,
      "courier-token",
      41.5610096,
      -8.4065289,
      request,
    );

    expect(duration).toBe(17);
    expect(calls).toEqual([{
      path: "/api/courier/location",
      options: {
        method: "POST",
        token: "courier-token",
        body: { lat: 41.5610096, lng: -8.4065289, accuracyM: 10 },
      },
    }]);
  });

  it("fails the load stage when the GPS heartbeat itself fails", async () => {
    const request = async <T>(): Promise<QaHttpResponse<T>> => ({
      ok: false,
      status: 500,
      durationMs: 12,
      data: { success: false, message: "GPS update failed" } as T,
    });

    await expect(refreshLoadCourierLocation(
      {} as QaConfig,
      "courier-token",
      41.5610096,
      -8.4065289,
      request,
    )).rejects.toThrow(/GPS/i);
  });
});

describe("QA load checkout classification", () => {
  it("accepts only the explicit OUT_OF_RANGE API code for an outside case", () => {
    const result = classifyLoadCheckout(
      { index: 8, kind: "edge-outside", distanceKm: 8.1, expectedCheckout: "OUT_OF_RANGE" },
      { ok: false, status: 400, durationMs: 12, data: { success: false, code: "OUT_OF_RANGE", message: "fora" } },
    );
    expect(result).toEqual({ outcome: "OUT_OF_RANGE" });
  });

  it("does not disguise a server failure as an out-of-range pass", () => {
    expect(() => classifyLoadCheckout(
      { index: 9, kind: "far-outside", distanceKm: 11, expectedCheckout: "OUT_OF_RANGE" },
      { ok: false, status: 500, durationMs: 12, data: { success: false, message: "Internal server error" } },
    )).toThrow(/case 9/i);
  });

  it("requires an accepted checkout to return a NEW order id", () => {
    const result = classifyLoadCheckout(
      { index: 0, kind: "inside", distanceKm: 1, expectedCheckout: "ACCEPT" },
      { ok: true, status: 201, durationMs: 20, data: { success: true, order: { id: "order-1", status: "NEW" } } },
    );
    expect(result).toEqual({ outcome: "ACCEPT", orderId: "order-1" });
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
