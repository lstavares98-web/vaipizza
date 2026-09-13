import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest, ProtectedSnapshot } from "./types.js";
import { assertMutationConfirmation } from "./config.js";
import { readJsonArtifact, writeJsonArtifact } from "./artifacts.js";
import { createEmptyManifest, createRunId, loadManifest, saveManifest } from "./manifest.js";
import { captureProtectedSnapshot, compareProtectedSnapshots } from "./snapshot.js";
import {
  addQaProductToCart,
  createQaAddress,
  createQaCatalogFixture,
  createQaCourierFixture,
  createQaCustomer,
  createQaOperatorFixture,
  type QaCourierSession,
  type QaCustomerSession,
  type QaOperatorSession,
} from "./fixtures.js";
import { pointAtDistanceKm } from "./scenarios/geo.js";
import { singleDeliveryCheckoutBody } from "./scenarios/singleDelivery.js";
import { expectQaSuccess, qaRequest } from "./http.js";
import { executeCleanup, preflightCleanup, type CleanupResult } from "./cleanup.js";

export interface BrowserRecoveryCredentials {
  email: string;
  password: string;
}

export interface BrowserRecoveryFixtureDocument {
  runId: string;
  apiUrl: string;
  orderId: string;
  orderNumber: number;
  productId: string;
  addressId: string;
  credentials: {
    customer: BrowserRecoveryCredentials;
    restaurant: BrowserRecoveryCredentials;
    kds: BrowserRecoveryCredentials;
    courier: BrowserRecoveryCredentials;
  };
}

export interface BrowserRecoveryFixtureDocumentInput {
  runId: string;
  apiUrl: string;
  orderId: string;
  orderNumber: number;
  productId: string;
  addressId: string;
  customer: QaCustomerSession;
  restaurant: QaOperatorSession;
  kds: QaOperatorSession;
  courier: QaCourierSession;
}

export interface BrowserRecoveryPrepareSummary {
  runId: string;
  orderId: string;
  orderNumber: number;
  fixturePath: string;
}

export interface BrowserRecoveryCleanupSummary {
  runId: string;
  cleanup: CleanupResult;
}

export interface BrowserOwnedOrderRow {
  id: string;
  userId: string;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function assertBrowserRecoveryFixturePath(filePath: string): string {
  const trimmed = filePath.trim();
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(trimmed);
  if (!trimmed || (!path.isAbsolute(trimmed) && !windowsAbsolute)) {
    throw new Error("Browser recovery fixture path must be absolute and ephemeral");
  }
  const normalizedSegments = trimmed.replaceAll("\\", "/").split("/").map((segment) => segment.toLowerCase());
  if (normalizedSegments.includes("qa-artifacts")) {
    throw new Error("Browser recovery fixture must never be written inside qa-artifacts");
  }
  return trimmed;
}

export function browserRecoveryRunId(now = new Date()): string {
  return `${createRunId(now)}-browser-refresh`;
}

export function buildBrowserRecoveryFixtureDocument(
  input: BrowserRecoveryFixtureDocumentInput,
): BrowserRecoveryFixtureDocument {
  return {
    runId: input.runId,
    apiUrl: input.apiUrl,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    productId: input.productId,
    addressId: input.addressId,
    credentials: {
      customer: { email: input.customer.email, password: input.customer.password },
      restaurant: { email: input.restaurant.email, password: input.restaurant.password },
      kds: { email: input.kds.email, password: input.kds.password },
      courier: { email: input.courier.email, password: input.courier.password },
    },
  };
}

export function mergeBrowserOwnedOrderIds(
  existingOrderIds: string[],
  customerUserIds: string[],
  orders: BrowserOwnedOrderRow[],
): string[] {
  const ownedCustomers = new Set(customerUserIds);
  const merged = new Set(existingOrderIds);
  for (const order of orders) {
    if (!ownedCustomers.has(order.userId)) {
      throw new Error(`Browser-created order ${order.id} is not owned by an owned QA customer`);
    }
    merged.add(order.id);
  }
  return [...merged];
}

function assertQaCredential(label: string, credentials: BrowserRecoveryCredentials): void {
  if (!credentials.email.startsWith("qa+") || !credentials.email.endsWith("@vaipizza.test")) {
    throw new Error(`Browser recovery ${label} credentials are not ephemeral QA credentials`);
  }
  if (!credentials.password) throw new Error(`Browser recovery ${label} password is missing`);
}

function validateBrowserRecoveryFixtureDocument(document: BrowserRecoveryFixtureDocument): void {
  if (!document.runId.startsWith("QA-") || !document.runId.endsWith("-browser-refresh")) {
    throw new Error("Browser recovery fixture has an invalid run id");
  }
  if (!document.apiUrl.includes("staging") && !document.apiUrl.includes("localhost") && !document.apiUrl.includes("127.0.0.1")) {
    throw new Error("Browser recovery fixture API URL is not an approved staging target");
  }
  if (!document.orderId || !Number.isInteger(document.orderNumber)) {
    throw new Error("Browser recovery fixture is missing order identifiers");
  }
  if (!document.productId || !document.addressId) {
    throw new Error("Browser recovery fixture is missing cart recovery identifiers");
  }
  assertQaCredential("customer", document.credentials.customer);
  assertQaCredential("restaurant", document.credentials.restaurant);
  assertQaCredential("kds", document.credentials.kds);
  assertQaCredential("courier", document.credentials.courier);
}

async function writeBrowserRecoveryFixtureFile(
  fixturePath: string,
  document: BrowserRecoveryFixtureDocument,
): Promise<void> {
  validateBrowserRecoveryFixtureDocument(document);
  const approvedPath = assertBrowserRecoveryFixturePath(fixturePath);
  await mkdir(path.dirname(approvedPath), { recursive: true });
  await writeFile(approvedPath, `${JSON.stringify(document)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

export async function readBrowserRecoveryFixtureFile(fixturePath: string): Promise<BrowserRecoveryFixtureDocument> {
  const approvedPath = assertBrowserRecoveryFixturePath(fixturePath);
  const parsed = JSON.parse(await readFile(approvedPath, "utf8")) as BrowserRecoveryFixtureDocument;
  validateBrowserRecoveryFixtureDocument(parsed);
  return parsed;
}

async function assertProtectedUnchanged(
  prisma: PrismaClient,
  runId: string,
  before: ProtectedSnapshot,
  artifactPrefix: string,
): Promise<void> {
  const current = await captureProtectedSnapshot(prisma);
  const diff = compareProtectedSnapshots(before, current);
  await writeJsonArtifact(runId, `${artifactPrefix}-snapshot`, current);
  await writeJsonArtifact(runId, `${artifactPrefix}-diff`, diff);
  if (diff.length) {
    throw new Error(`Protected staging configuration changed during browser recovery (${artifactPrefix})`);
  }
}

async function adoptBrowserOwnedOrders(prisma: PrismaClient, manifest: QaRunManifest): Promise<void> {
  if (!manifest.customerUserIds.length) return;
  const orders = await prisma.order.findMany({
    where: { userId: { in: manifest.customerUserIds } },
    select: { id: true, userId: true },
  });
  const previousIds = new Set(manifest.orderIds);
  const mergedIds = mergeBrowserOwnedOrderIds(manifest.orderIds, manifest.customerUserIds, orders);
  const adoptedOrderIds = mergedIds.filter((id) => !previousIds.has(id));
  if (!adoptedOrderIds.length) return;
  manifest.orderIds = mergedIds;
  await saveManifest(manifest);
  await writeJsonArtifact(manifest.runId, "browser-adopted-orders", { adoptedOrderIds });
}

async function cleanupBrowserRecoveryManifest(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  protectedBefore: ProtectedSnapshot,
): Promise<CleanupResult> {
  await assertProtectedUnchanged(prisma, manifest.runId, protectedBefore, "browser-protected-precleanup");
  const plan = await preflightCleanup(prisma, manifest);
  await writeJsonArtifact(manifest.runId, "browser-cleanup-plan", plan);
  const cleanup = await executeCleanup(prisma, plan, config);
  await writeJsonArtifact(manifest.runId, "browser-cleanup-result", cleanup);
  await assertProtectedUnchanged(prisma, manifest.runId, protectedBefore, "browser-protected-after");
  if (cleanup.remainingIds.length) {
    throw new Error(`Browser recovery cleanup left QA ids behind: ${cleanup.remainingIds.join(", ")}`);
  }
  return cleanup;
}

async function assertBrowserRecoveryStartsClean(prisma: PrismaClient, protectedBefore: ProtectedSnapshot): Promise<void> {
  const waitingOrders = await prisma.order.count({
    where: { restaurantId: protectedBefore.restaurant.id, status: "WAITING_FOR_COURIER" },
  });
  if (waitingOrders !== 0) {
    throw new Error(`Browser recovery cannot start with ${waitingOrders} order(s) waiting for courier`);
  }
}

export async function prepareBrowserRecoveryFixture(
  prisma: PrismaClient,
  config: QaConfig,
  fixturePath: string,
  now = new Date(),
): Promise<BrowserRecoveryPrepareSummary> {
  assertMutationConfirmation(config);
  const approvedPath = assertBrowserRecoveryFixturePath(fixturePath);
  const manifest = createEmptyManifest(config, browserRecoveryRunId(now));
  manifest.scenarioNames.push("browser-refresh-reopen");
  await saveManifest(manifest);

  const protectedBefore = await captureProtectedSnapshot(prisma);
  await writeJsonArtifact(manifest.runId, "protected-before", protectedBefore);
  await assertBrowserRecoveryStartsClean(prisma, protectedBefore);

  try {
    const catalog = await createQaCatalogFixture(prisma, config, manifest);
    const customer = await createQaCustomer(config, manifest, 0);
    const restaurant = await createQaOperatorFixture(prisma, config, manifest, "staff");
    const kds = await createQaOperatorFixture(prisma, config, manifest, "kitchen");
    const courier = await createQaCourierFixture(prisma, config, manifest, {
      index: 0,
      status: "AVAILABLE",
      lat: protectedBefore.restaurant.lat,
      lng: protectedBefore.restaurant.lng,
      accuracyM: 10,
      locationUpdatedAt: new Date(),
    });

    const deliveryPoint = pointAtDistanceKm(
      protectedBefore.restaurant.lat,
      protectedBefore.restaurant.lng,
      1,
      90,
    );
    const addressId = await createQaAddress(config, manifest, customer.accessToken, {
      labelSuffix: "browser-refresh",
      line1: `[QA ${manifest.runId}] browser refresh address`,
      city: "Braga",
      postalCode: "4700-000",
      lat: deliveryPoint.lat,
      lng: deliveryPoint.lng,
      isDefault: true,
    });

    await addQaProductToCart(config, customer.accessToken, catalog.productId, 1);
    const checkoutResponse = await qaRequest<{
      success: boolean;
      order: { id: string; orderNumber: number; status: string };
      message?: string;
    }>(config, "/api/orders", {
      method: "POST",
      token: customer.accessToken,
      body: singleDeliveryCheckoutBody(addressId, manifest.runId),
    });
    const checkout = expectQaSuccess(checkoutResponse, "Browser recovery checkout");
    if (!checkout.order?.id || !Number.isInteger(checkout.order.orderNumber) || checkout.order.status !== "NEW") {
      throw new Error("Browser recovery checkout did not return a NEW order with identifiers");
    }
    manifest.orderIds.push(checkout.order.id);
    manifest.timings["browser checkout"] = checkoutResponse.durationMs;
    await saveManifest(manifest);

    const document = buildBrowserRecoveryFixtureDocument({
      runId: manifest.runId,
      apiUrl: config.apiUrl,
      orderId: checkout.order.id,
      orderNumber: checkout.order.orderNumber,
      productId: catalog.productId,
      addressId,
      customer,
      restaurant,
      kds,
      courier,
    });
    await writeBrowserRecoveryFixtureFile(approvedPath, document);

    await writeJsonArtifact(manifest.runId, "browser-fixture-observation", {
      orderId: checkout.order.id,
      orderNumber: checkout.order.orderNumber,
      productId: catalog.productId,
      addressId,
      surfaces: ["customer", "restaurant", "kds", "courier"],
      fixtureCredentialsPersistedToArtifacts: false,
    });

    return {
      runId: manifest.runId,
      orderId: checkout.order.id,
      orderNumber: checkout.order.orderNumber,
      fixturePath: approvedPath,
    };
  } catch (error) {
    let cleanupError: Error | null = null;
    try {
      await cleanupBrowserRecoveryManifest(prisma, config, manifest, protectedBefore);
    } catch (cleanupFailure) {
      cleanupError = asError(cleanupFailure);
    }
    await rm(approvedPath, { force: true }).catch(() => {});
    if (cleanupError) {
      throw new Error(`Browser recovery fixture preparation failed: ${asError(error).message}; cleanup also failed: ${cleanupError.message}`);
    }
    throw error;
  }
}

export async function cleanupBrowserRecoveryFixture(
  prisma: PrismaClient,
  config: QaConfig,
  fixturePath: string,
): Promise<BrowserRecoveryCleanupSummary> {
  assertMutationConfirmation(config);
  const approvedPath = assertBrowserRecoveryFixturePath(fixturePath);
  const fixture = await readBrowserRecoveryFixtureFile(approvedPath);
  const manifest = await loadManifest(fixture.runId);
  if (manifest.apiHost !== config.apiHostname || manifest.supabaseProjectRef !== config.supabaseProjectRef) {
    throw new Error("Browser recovery manifest target does not match the approved staging target");
  }
  await adoptBrowserOwnedOrders(prisma, manifest);
  const protectedBefore = await readJsonArtifact<ProtectedSnapshot>(manifest.runId, "protected-before");
  const cleanup = await cleanupBrowserRecoveryManifest(prisma, config, manifest, protectedBefore);
  await rm(approvedPath, { force: true });
  return { runId: manifest.runId, cleanup };
}
