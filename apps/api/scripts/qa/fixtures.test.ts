import { describe, expect, it } from "vitest";
import type { QaConfig } from "./types.js";
import type { QaHttpResponse, QaRequestOptions } from "./http.js";
import {
  createQaPassword,
  qaOperatorLoginPath,
  qaOperatorRole,
  qaPhone,
  refreshQaAuthSession,
  shouldRefreshQaSession,
} from "./fixtures.js";

describe("QA fixture helpers", () => {
  it("creates deterministic Portuguese-format QA phones", () => {
    expect(qaPhone(0)).toBe("910000000");
    expect(qaPhone(42)).toBe("910000042");
  });

  it("rejects out-of-range phone indexes", () => {
    expect(() => qaPhone(-1)).toThrow();
    expect(() => qaPhone(10_000_000)).toThrow();
  });

  it("keeps generated passwords in the accepted API length range", () => {
    const password = createQaPassword();
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password.length).toBeLessThanOrEqual(72);
    expect(password).toMatch(/Aa1!$/);
  });

  it("maps isolated restaurant operators to the existing auth roles", () => {
    expect(qaOperatorRole("staff")).toBe("RESTAURANT_STAFF");
    expect(qaOperatorRole("kitchen")).toBe("KITCHEN");
  });

  it("uses the correct real login endpoint for each isolated operator", () => {
    expect(qaOperatorLoginPath("staff")).toBe("/api/auth/restaurant/login");
    expect(qaOperatorLoginPath("kitchen")).toBe("/api/auth/kitchen/login");
  });

  it("renews long-running QA sessions before the 15-minute access token expires", () => {
    const issuedAt = 1_000_000;
    expect(shouldRefreshQaSession(issuedAt + 9 * 60_000 + 59_000, issuedAt)).toBe(false);
    expect(shouldRefreshQaSession(issuedAt + 10 * 60_000, issuedAt)).toBe(true);
  });

  it("rotates a QA session through the real refresh endpoint contract", async () => {
    const calls: Array<{ path: string; options?: QaRequestOptions }> = [];
    const request = async <T>(
      _config: QaConfig,
      path: string,
      options?: QaRequestOptions,
    ): Promise<QaHttpResponse<T>> => {
      calls.push({ path, options });
      return {
        ok: true,
        status: 200,
        durationMs: 21,
        data: {
          success: true,
          accessToken: "access-new",
          refreshToken: "refresh-new",
        } as T,
      };
    };

    const session = await refreshQaAuthSession(
      {} as QaConfig,
      { accessToken: "access-old", refreshToken: "refresh-old", refreshedAtMs: 1_000 },
      request,
      2_000,
    );

    expect(session).toEqual({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      refreshedAtMs: 2_000,
    });
    expect(calls).toEqual([{
      path: "/api/auth/refresh",
      options: {
        method: "POST",
        body: { refreshToken: "refresh-old" },
      },
    }]);
  });
});
