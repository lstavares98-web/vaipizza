import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loadBrowserUiFixture } from "./surface-login";

const credentials = {
  customer: { email: "qa+customer@vaipizza.test", password: "customer-password" },
  restaurant: { email: "qa+restaurant@vaipizza.test", password: "restaurant-password" },
  kds: { email: "qa+kds@vaipizza.test", password: "kds-password" },
  courier: { email: "qa+courier@vaipizza.test", password: "courier-password" },
};

function writeFixture(overrides: Record<string, unknown> = {}): string {
  const file = path.join(os.tmpdir(), `vaipizza-surface-fixture-${process.pid}-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    runId: "QA-20260913-150000-browser-refresh",
    apiUrl: "https://vaipizza-api-staging.onrender.com",
    orderId: "order-qa",
    orderNumber: 321,
    productId: "product-qa",
    addressId: "address-qa",
    credentials,
    ...overrides,
  }));
  return file;
}

test("browser UI fixture requires product and address identifiers for offline checkout QA", () => {
  const withoutProduct = writeFixture({ productId: "" });
  const withoutAddress = writeFixture({ addressId: "" });
  const complete = writeFixture();

  try {
    expect(() => loadBrowserUiFixture(withoutProduct)).toThrow(/product.*address|cart recovery/i);
    expect(() => loadBrowserUiFixture(withoutAddress)).toThrow(/product.*address|cart recovery/i);
    const fixture = loadBrowserUiFixture(complete);
    expect(fixture.productId).toBe("product-qa");
    expect(fixture.addressId).toBe("address-qa");
  } finally {
    fs.rmSync(withoutProduct, { force: true });
    fs.rmSync(withoutAddress, { force: true });
    fs.rmSync(complete, { force: true });
  }
});
