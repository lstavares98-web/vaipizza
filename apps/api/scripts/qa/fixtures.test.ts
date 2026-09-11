import { describe, expect, it } from "vitest";
import { createQaPassword, qaOperatorLoginPath, qaOperatorRole, qaPhone } from "./fixtures.js";

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
});
