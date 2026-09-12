import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest } from "./types.js";
import { assertMutationConfirmation } from "./config.js";
import { expectQaSuccess, qaRequest, type QaHttpResponse, type QaRequestOptions } from "./http.js";
import { qaCourierEmail, qaEmail, qaOperatorEmail, saveManifest } from "./manifest.js";

const BCRYPT_ROUNDS = 12;
const QA_SESSION_REFRESH_AFTER_MS = 10 * 60_000;

export type QaOperatorKind = "staff" | "kitchen";

export interface QaAuthSession {
  accessToken: string;
  refreshToken: string;
  refreshedAtMs: number;
}

export interface QaCustomerSession extends QaAuthSession {
  userId: string;
  email: string;
  password: string;
}

export interface QaCourierSession {
  userId: string;
  courierId: string;
  email: string;
  password: string;
}

export interface QaOperatorSession extends QaAuthSession {
  userId: string;
  email: string;
  password: string;
  role: "RESTAURANT_STAFF" | "KITCHEN";
}

export interface QaCourierFixtureOptions {
  index: number;
  status: "OFFLINE" | "AVAILABLE" | "ASSIGNED" | "GOING_TO_RESTAURANT" | "AT_RESTAURANT" | "PICKED_UP" | "DELIVERING";
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationUpdatedAt?: Date | null;
}

export type QaFixtureRequestExecutor = <T>(
  config: QaConfig,
  path: string,
  options?: QaRequestOptions,
) => Promise<QaHttpResponse<T>>;

export function qaPhone(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 9_999_999) {
    throw new Error("QA phone index must be an integer from 0 to 9,999,999");
  }
  return `91${String(index).padStart(7, "0")}`;
}

export function createQaPassword(): string {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

export function qaOperatorRole(kind: QaOperatorKind): "RESTAURANT_STAFF" | "KITCHEN" {
  return kind === "staff" ? "RESTAURANT_STAFF" : "KITCHEN";
}

export function qaOperatorLoginPath(kind: QaOperatorKind): "/api/auth/restaurant/login" | "/api/auth/kitchen/login" {
  return kind === "staff" ? "/api/auth/restaurant/login" : "/api/auth/kitchen/login";
}

export function shouldRefreshQaSession(
  nowMs: number,
  refreshedAtMs: number,
  refreshAfterMs = QA_SESSION_REFRESH_AFTER_MS,
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(refreshedAtMs) || !Number.isFinite(refreshAfterMs) || refreshAfterMs <= 0) {
    throw new Error("QA session refresh timing is invalid");
  }
  return nowMs - refreshedAtMs >= refreshAfterMs;
}

export async function refreshQaAuthSession(
  config: QaConfig,
  session: QaAuthSession,
  request: QaFixtureRequestExecutor = qaRequest,
  nowMs = Date.now(),
): Promise<QaAuthSession> {
  const response = await request<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
    message?: string;
  }>(config, "/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.refreshToken },
  });
  const data = expectQaSuccess(response, "Refresh QA auth session");
  if (!data.accessToken || !data.refreshToken) {
    throw new Error("Refresh QA auth session returned incomplete tokens");
  }
  return { accessToken: data.accessToken, refreshToken: data.refreshToken, refreshedAtMs: nowMs };
}

export async function createQaCustomer(
  config: QaConfig,
  manifest: QaRunManifest,
  index: number,
): Promise<QaCustomerSession> {
  assertMutationConfirmation(config);
  const email = qaEmail(manifest.runId, index);
  const password = createQaPassword();
  const response = await qaRequest<{
    success: boolean;
    user: { id: string };
    accessToken: string;
    refreshToken: string;
    message?: string;
  }>(config, "/api/auth/register", {
    method: "POST",
    body: {
      name: `[QA ${manifest.runId}] Cliente ${index}`,
      email,
      password,
      phone: qaPhone(index),
    },
  });
  const data = expectQaSuccess(response, "Create QA customer");
  if (!data.user?.id || !data.accessToken || !data.refreshToken) {
    throw new Error("Create QA customer returned an incomplete session");
  }
  manifest.customerUserIds.push(data.user.id);
  await saveManifest(manifest);
  return {
    userId: data.user.id,
    email,
    password,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    refreshedAtMs: Date.now(),
  };
}

export async function createQaOperatorFixture(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  kind: QaOperatorKind,
): Promise<QaOperatorSession> {
  assertMutationConfirmation(config);
  const slug = process.env.PRIMARY_RESTAURANT_SLUG ?? "vaipizza";
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) throw new Error(`QA operator restaurant not found: ${slug}`);

  const email = qaOperatorEmail(manifest.runId, kind);
  const password = createQaPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const role = qaOperatorRole(kind);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: `[QA ${manifest.runId}] Operador ${kind}`,
      phone: qaPhone(kind === "staff" ? 8_000_001 : 8_000_002),
      role,
      restaurantId: restaurant.id,
    },
  });
  manifest.operatorUserIds.push(user.id);
  await saveManifest(manifest);

  const response = await qaRequest<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
    message?: string;
  }>(config, qaOperatorLoginPath(kind), { method: "POST", body: { email, password } });
  const data = expectQaSuccess(response, `Login QA ${kind} operator`);
  if (!data.accessToken || !data.refreshToken) {
    throw new Error(`QA ${kind} operator login returned incomplete tokens`);
  }
  return {
    userId: user.id,
    email,
    password,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    refreshedAtMs: Date.now(),
    role,
  };
}

export async function createQaCatalogFixture(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
): Promise<{ categoryId: string; productId: string }> {
  assertMutationConfirmation(config);
  const slug = process.env.PRIMARY_RESTAURANT_SLUG ?? "vaipizza";
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) throw new Error(`QA catalog restaurant not found: ${slug}`);

  const category = await prisma.category.create({
    data: {
      restaurantId: restaurant.id,
      name: `[QA ${manifest.runId}] Categoria`,
      sortOrder: 99_000,
    },
  });
  manifest.categoryIds.push(category.id);
  await saveManifest(manifest);

  const product = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: `[QA ${manifest.runId}] Produto`,
      description: "Produto exclusivo do runner QA; pode ser removido após a execução.",
      basePrice: 9.99,
      isAvailable: true,
      stock: null,
      allowsSplit: false,
      sortOrder: 99_000,
    },
  });
  manifest.productIds.push(product.id);
  await saveManifest(manifest);

  return { categoryId: category.id, productId: product.id };
}

export async function createQaCourierFixture(
  prisma: PrismaClient,
  config: QaConfig,
  manifest: QaRunManifest,
  options: QaCourierFixtureOptions,
): Promise<QaCourierSession> {
  assertMutationConfirmation(config);
  const email = qaCourierEmail(manifest.runId, options.index);
  const password = createQaPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: `[QA ${manifest.runId}] Estafeta ${options.index}`,
      phone: qaPhone(5_000_000 + options.index),
      role: "COURIER",
    },
  });
  manifest.courierUserIds.push(user.id);
  await saveManifest(manifest);

  const hasLocation = options.lat != null && options.lng != null;
  const courier = await prisma.courier.create({
    data: {
      userId: user.id,
      vehicleType: "BIKE",
      vehicleNumber: `QA-${options.index}`,
      verificationStatus: "APPROVED",
      status: options.status,
      lat: options.lat ?? null,
      lng: options.lng ?? null,
      locationAccuracyM: options.accuracyM ?? null,
      locationUpdatedAt: options.locationUpdatedAt === undefined
        ? (hasLocation ? new Date() : null)
        : options.locationUpdatedAt,
    },
  });
  manifest.courierIds.push(courier.id);
  await saveManifest(manifest);

  return { userId: user.id, courierId: courier.id, email, password };
}

export async function loginQaCourierSession(
  config: QaConfig,
  email: string,
  password: string,
): Promise<QaAuthSession> {
  assertMutationConfirmation(config);
  const response = await qaRequest<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
    message?: string;
  }>(config, "/api/auth/courier/login", { method: "POST", body: { email, password } });
  const data = expectQaSuccess(response, "Login QA courier");
  if (!data.accessToken || !data.refreshToken) {
    throw new Error("QA courier login returned incomplete tokens");
  }
  return { accessToken: data.accessToken, refreshToken: data.refreshToken, refreshedAtMs: Date.now() };
}

export async function loginQaCourier(config: QaConfig, email: string, password: string): Promise<string> {
  return (await loginQaCourierSession(config, email, password)).accessToken;
}

export async function createQaAddress(
  config: QaConfig,
  manifest: QaRunManifest,
  accessToken: string,
  input: { labelSuffix: string; line1: string; city: string; postalCode?: string; lat: number; lng: number; isDefault?: boolean },
): Promise<string> {
  assertMutationConfirmation(config);
  const response = await qaRequest<{ success: boolean; address: { id: string }; message?: string }>(
    config,
    "/api/addresses",
    {
      method: "POST",
      token: accessToken,
      body: {
        label: `QA ${manifest.runId} ${input.labelSuffix}`.slice(0, 40),
        line1: input.line1,
        city: input.city,
        postalCode: input.postalCode,
        lat: input.lat,
        lng: input.lng,
        isDefault: input.isDefault ?? true,
      },
    },
  );
  const data = expectQaSuccess(response, "Create QA address");
  if (!data.address?.id) throw new Error("Create QA address returned no id");
  manifest.addressIds.push(data.address.id);
  await saveManifest(manifest);
  return data.address.id;
}

export async function addQaProductToCart(
  config: QaConfig,
  accessToken: string,
  productId: string,
  quantity = 1,
): Promise<void> {
  assertMutationConfirmation(config);
  const response = await qaRequest<{ success: boolean; message?: string }>(config, "/api/cart/items", {
    method: "POST",
    token: accessToken,
    body: { productId, quantity, modifierOptionIds: [], notes: "[QA]" },
  });
  expectQaSuccess(response, "Add QA product to cart");
}
