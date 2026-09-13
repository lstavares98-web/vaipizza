import { describe, expect, it } from "vitest";
import type { BrowserRecoveryFixtureDocument } from "./browserRecoveryFixture.js";
import {
  buildBrowserFixtureArtifactView,
  parseBrowserFixtureCommand,
} from "./browserFixtureRunner.js";

const fixture: BrowserRecoveryFixtureDocument = {
  runId: "QA-20260913-150000-browser-refresh",
  apiUrl: "https://vaipizza-api-staging.onrender.com",
  orderId: "order-qa",
  orderNumber: 321,
  credentials: {
    customer: { email: "qa+customer@vaipizza.test", password: "customer-password" },
    restaurant: { email: "qa+restaurant@vaipizza.test", password: "restaurant-password" },
    kds: { email: "qa+kds@vaipizza.test", password: "kds-password" },
    courier: { email: "qa+courier@vaipizza.test", password: "courier-password" },
  },
};

describe("browser fixture runner handoff", () => {
  it("builds an artifact-safe view with identifiers and QA emails but no secrets", () => {
    const view = buildBrowserFixtureArtifactView(fixture);
    const serialized = JSON.stringify(view);

    expect(view).toEqual({
      runId: fixture.runId,
      apiUrl: fixture.apiUrl,
      orderId: fixture.orderId,
      orderNumber: fixture.orderNumber,
      emails: {
        customer: fixture.credentials.customer.email,
        restaurant: fixture.credentials.restaurant.email,
        kds: fixture.credentials.kds.email,
        courier: fixture.credentials.courier.email,
      },
      credentialsPersisted: false,
    });
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("customer-password");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
  });

  it("accepts generic browser fixture commands while preserving recovery aliases", () => {
    expect(parseBrowserFixtureCommand("browser-fixture-prepare")).toBe("prepare");
    expect(parseBrowserFixtureCommand("browser-recovery-prepare")).toBe("prepare");
    expect(parseBrowserFixtureCommand("browser-fixture-cleanup")).toBe("cleanup");
    expect(parseBrowserFixtureCommand("browser-recovery-cleanup")).toBe("cleanup");
    expect(parseBrowserFixtureCommand("unknown")).toBeNull();
  });
});
