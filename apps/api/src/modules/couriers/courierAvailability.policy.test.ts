import { describe, expect, it } from "vitest";
import { normalizeCourierStatusOnLogin } from "./courierAvailability.policy.js";

describe("normalizeCourierStatusOnLogin", () => {
  it("turns an idle AVAILABLE courier OFFLINE on a fresh login", () => {
    expect(normalizeCourierStatusOnLogin("AVAILABLE")).toBe("OFFLINE");
  });

  it.each(["ASSIGNED", "GOING_TO_RESTAURANT", "AT_RESTAURANT", "PICKED_UP", "DELIVERING"] as const)(
    "preserves active work status %s during device replacement",
    (status) => {
      expect(normalizeCourierStatusOnLogin(status)).toBe(status);
    },
  );

  it("keeps an already OFFLINE courier OFFLINE", () => {
    expect(normalizeCourierStatusOnLogin("OFFLINE")).toBe("OFFLINE");
  });
});
