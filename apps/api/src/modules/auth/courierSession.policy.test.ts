import { describe, expect, it } from "vitest";
import { isCurrentCourierSession } from "./courierSession.policy.js";

describe("isCurrentCourierSession", () => {
  it("accepts matching courier session versions", () => {
    expect(isCurrentCourierSession(7, 7)).toBe(true);
  });

  it("rejects an old courier session after a newer login", () => {
    expect(isCurrentCourierSession(6, 7)).toBe(false);
  });

  it("rejects a courier token without a session version", () => {
    expect(isCurrentCourierSession(undefined, 7)).toBe(false);
  });
});
