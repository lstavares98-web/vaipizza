import { describe, expect, it } from "vitest";
import {
  assertBrowserRecoveryFixturePath,
  browserRecoveryRunId,
  buildBrowserRecoveryFixtureDocument,
} from "./browserRecoveryFixture.js";

describe("browser recovery fixture safety", () => {
  it("requires an absolute ephemeral path outside qa-artifacts", () => {
    expect(() => assertBrowserRecoveryFixturePath("relative/browser.json")).toThrow(/absolute/i);
    expect(() => assertBrowserRecoveryFixturePath("/tmp/qa-artifacts/browser.json")).toThrow(/qa-artifacts/i);
    expect(assertBrowserRecoveryFixturePath("/tmp/vaipizza-browser-recovery.json")).toBe("/tmp/vaipizza-browser-recovery.json");
  });

  it("uses a QA run id dedicated to browser refresh recovery", () => {
    expect(browserRecoveryRunId(new Date("2026-09-13T12:34:56.000Z"))).toBe(
      "QA-20260913-123456-browser-refresh",
    );
  });

  it("persists only ephemeral credentials and identifiers, never auth tokens", () => {
    const document = buildBrowserRecoveryFixtureDocument({
      runId: "QA-20260913-123456-browser-refresh",
      apiUrl: "https://vaipizza-api-staging.onrender.com",
      orderId: "order-qa",
      orderNumber: 123,
      productId: "product-qa",
      addressId: "address-qa",
      customer: {
        userId: "customer-user",
        email: "qa+QA-20260913-123456-browser-refresh-0@vaipizza.test",
        password: "customer-password",
        accessToken: "customer-access-secret",
        refreshToken: "customer-refresh-secret",
        refreshedAtMs: 1,
      },
      restaurant: {
        userId: "staff-user",
        email: "qa+QA-20260913-123456-browser-refresh-operator-staff@vaipizza.test",
        password: "staff-password",
        accessToken: "staff-access-secret",
        refreshToken: "staff-refresh-secret",
        refreshedAtMs: 1,
        role: "RESTAURANT_STAFF",
      },
      kds: {
        userId: "kitchen-user",
        email: "qa+QA-20260913-123456-browser-refresh-operator-kitchen@vaipizza.test",
        password: "kitchen-password",
        accessToken: "kitchen-access-secret",
        refreshToken: "kitchen-refresh-secret",
        refreshedAtMs: 1,
        role: "KITCHEN",
      },
      courier: {
        userId: "courier-user",
        courierId: "courier-qa",
        email: "qa+QA-20260913-123456-browser-refresh-courier-0@vaipizza.test",
        password: "courier-password",
      },
    });

    expect(document.productId).toBe("product-qa");
    expect(document.addressId).toBe("address-qa");
    expect(document.credentials.customer.email).toContain("@vaipizza.test");
    expect(document.credentials.restaurant.password).toBe("staff-password");
    expect(JSON.stringify(document)).not.toContain("access-secret");
    expect(JSON.stringify(document)).not.toContain("refresh-secret");
  });
});
