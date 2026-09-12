import { describe, expect, it } from "vitest";
import type { QaRunManifest } from "./types.js";
import type { CleanupOwnershipSnapshot } from "./cleanup.js";
import { cleanupMode, validateCleanupOwnership } from "./cleanup.js";

function manifest(): QaRunManifest {
  return {
    runId: "QA-20260911-191500",
    createdAt: "2026-09-11T19:15:00.000Z",
    environment: "staging",
    apiHost: "vaipizza-api-staging.onrender.com",
    supabaseProjectRef: "vnuowugruqheakomdtuh",
    scenarioNames: [],
    customerUserIds: ["customer-1"],
    operatorUserIds: [],
    courierUserIds: ["courier-user-1"],
    courierIds: ["courier-1"],
    addressIds: ["address-1"],
    categoryIds: ["category-1"],
    productIds: ["product-1"],
    orderIds: ["order-1"],
    timings: {},
  };
}

function ownedSnapshot(): CleanupOwnershipSnapshot {
  return {
    users: [
      { id: "customer-1", email: "qa+QA-20260911-191500-1@vaipizza.test", role: "CUSTOMER" },
      { id: "courier-user-1", email: "qa+QA-20260911-191500-courier-1@vaipizza.test", role: "COURIER" },
    ],
    orders: [{ id: "order-1", userId: "customer-1" }],
    couriers: [{ id: "courier-1", userId: "courier-user-1", email: "qa+QA-20260911-191500-courier-1@vaipizza.test" }],
    addresses: [{ id: "address-1", userId: "customer-1" }],
    products: [{ id: "product-1", categoryId: "category-1", name: "[QA QA-20260911-191500] Produto" }],
    categories: [{ id: "category-1", name: "[QA QA-20260911-191500] Categoria" }],
    unexpectedCustomerOrders: [],
    unexpectedCourierRefs: [],
    unexpectedProductRefs: [],
    unexpectedCategoryProducts: [],
  };
}

describe("QA cleanup ownership guard", () => {
  it("rejects a manifest user that is not QA-owned", () => {
    const snapshot = ownedSnapshot();
    snapshot.users[0]!.email = "real@customer.pt";
    expect(() => validateCleanupOwnership(manifest(), snapshot)).toThrow(/customer user/i);
  });

  it("accepts an isolated QA restaurant operator", () => {
    const testManifest = manifest();
    testManifest.operatorUserIds.push("operator-1");
    const snapshot = ownedSnapshot();
    snapshot.users.push({
      id: "operator-1",
      email: "qa+QA-20260911-191500-operator-staff@vaipizza.test",
      role: "RESTAURANT_STAFF",
    });
    expect(() => validateCleanupOwnership(testManifest, snapshot)).not.toThrow();
  });

  it("rejects a tracked operator with a non-QA email", () => {
    const testManifest = manifest();
    testManifest.operatorUserIds.push("operator-1");
    const snapshot = ownedSnapshot();
    snapshot.users.push({ id: "operator-1", email: "gestao@real.pt", role: "RESTAURANT_STAFF" });
    expect(() => validateCleanupOwnership(testManifest, snapshot)).toThrow(/operator user/i);
  });

  it("rejects an order owned by a non-QA user", () => {
    const snapshot = ownedSnapshot();
    snapshot.orders[0]!.userId = "real-user";
    expect(() => validateCleanupOwnership(manifest(), snapshot)).toThrow(/order/i);
  });

  it("rejects a courier linked to the wrong user", () => {
    const snapshot = ownedSnapshot();
    snapshot.couriers[0]!.userId = "real-user";
    expect(() => validateCleanupOwnership(manifest(), snapshot)).toThrow(/courier/i);
  });

  it("is dry-run unless confirm-delete is explicit", () => {
    expect(cleanupMode(false)).toBe("dry-run");
    expect(cleanupMode(true)).toBe("delete");
  });

  it("accepts already-missing rows so a second cleanup is idempotent", () => {
    const empty: CleanupOwnershipSnapshot = {
      users: [], orders: [], couriers: [], addresses: [], products: [], categories: [],
      unexpectedCustomerOrders: [], unexpectedCourierRefs: [], unexpectedProductRefs: [], unexpectedCategoryProducts: [],
    };
    expect(() => validateCleanupOwnership(manifest(), empty)).not.toThrow();
  });

  it("allows a transient dispatch offer from a QA courier to an old waiting order", () => {
    const snapshot = ownedSnapshot();
    snapshot.unexpectedCourierRefs.push({ courierId: "courier-1", orderId: "old-waiting-order", source: "assignment" });
    expect(() => validateCleanupOwnership(manifest(), snapshot)).not.toThrow();
  });

  it("still rejects an untracked order that actually owns the QA courier", () => {
    const snapshot = ownedSnapshot();
    snapshot.unexpectedCourierRefs.push({ courierId: "courier-1", orderId: "real-order", source: "order" });
    expect(() => validateCleanupOwnership(manifest(), snapshot)).toThrow(/untracked orders/i);
  });

  it("rejects a QA product referenced outside the run", () => {
    const snapshot = ownedSnapshot();
    snapshot.unexpectedProductRefs.push({ productId: "product-1", source: "order-item", ownerId: "real-order" });
    expect(() => validateCleanupOwnership(manifest(), snapshot)).toThrow(/referenced outside/i);
  });
});
