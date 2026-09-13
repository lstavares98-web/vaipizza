import fs from "node:fs";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import {
  startSocketRecoveryFixture,
  type SocketRecoveryFixture,
} from "./helpers/socket-control";
import {
  getStagingSessionSurface,
  installStagingSession,
  loginStagingSession,
  type StagingCredentials,
  type StagingSessionSurface,
  type StagingSessionTokens,
} from "./helpers/staging-sessions";

interface LiveStagingRecoveryFixture {
  runId: string;
  apiUrl: string;
  orderId: string;
  orderNumber: number;
  credentials: Record<StagingSessionSurface, StagingCredentials>;
}

let fixture: SocketRecoveryFixture;

test.beforeAll(async () => {
  fixture = await startSocketRecoveryFixture();
});

test.afterAll(async () => {
  await fixture.close();
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live staging refresh recovery`);
  return value.replace(/\/$/, "");
}

function loadLiveFixture(): LiveStagingRecoveryFixture {
  const file = process.env.QA_BROWSER_FIXTURE_FILE?.trim();
  if (!file) throw new Error("QA_BROWSER_FIXTURE_FILE is required for live staging refresh recovery");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as LiveStagingRecoveryFixture;
  if (!parsed.runId?.startsWith("QA-") || !parsed.apiUrl || !parsed.orderId || !Number.isInteger(parsed.orderNumber)) {
    throw new Error("Live staging recovery fixture is incomplete");
  }
  for (const surface of ["customer", "restaurant", "kds", "courier"] as const) {
    const credentials = parsed.credentials?.[surface];
    if (!credentials?.email?.startsWith("qa+") || !credentials.email.endsWith("@vaipizza.test") || !credentials.password) {
      throw new Error(`Live staging recovery fixture has invalid ${surface} credentials`);
    }
  }
  return parsed;
}

async function assertAuthoritativeOrderStatus(
  request: APIRequestContext,
  live: LiveStagingRecoveryFixture,
  customerToken: string,
  expectedStatus: string,
): Promise<void> {
  const response = await request.get(`${live.apiUrl.replace(/\/$/, "")}/api/orders/${live.orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { order?: { id?: string; status?: string } };
  expect(body.order?.id).toBe(live.orderId);
  expect(body.order?.status).toBe(expectedStatus);
}

async function patchOrderStatus(
  request: APIRequestContext,
  live: LiveStagingRecoveryFixture,
  token: string,
  status: string,
): Promise<void> {
  const response = await request.patch(`${live.apiUrl.replace(/\/$/, "")}/api/restaurant/orders/${live.orderId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status },
  });
  expect(response.ok()).toBeTruthy();
}

async function patchCourierOrderStatus(
  request: APIRequestContext,
  live: LiveStagingRecoveryFixture,
  courierToken: string,
  status: string,
): Promise<void> {
  const response = await request.patch(`${live.apiUrl.replace(/\/$/, "")}/api/courier/orders/${live.orderId}/status`, {
    headers: { Authorization: `Bearer ${courierToken}` },
    data: { status },
  });
  expect(response.ok()).toBeTruthy();
}

async function openSurface(
  context: BrowserContext,
  surface: StagingSessionSurface,
  tokens: StagingSessionTokens,
  url: string,
): Promise<Page> {
  await installStagingSession(context, surface, tokens);
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

test("staging session helper maps each surface to its real login and token store", () => {
  expect(getStagingSessionSurface("customer")).toEqual({
    loginPath: "/api/auth/customer/login",
    accessTokenKey: "vaipizza_customer_access_token",
    refreshTokenKey: "vaipizza_customer_refresh_token",
  });
  expect(getStagingSessionSurface("restaurant")).toEqual({
    loginPath: "/api/auth/restaurant/login",
    accessTokenKey: "vaipizza_restaurant_access_token",
    refreshTokenKey: "vaipizza_restaurant_refresh_token",
  });
  expect(getStagingSessionSurface("kds")).toEqual({
    loginPath: "/api/auth/kitchen/login",
    accessTokenKey: "vaipizza_kds_access_token",
    refreshTokenKey: "vaipizza_kds_refresh_token",
  });
  expect(getStagingSessionSurface("courier")).toEqual({
    loginPath: "/api/auth/courier/login",
    accessTokenKey: "vaipizza_courier_access_token",
    refreshTokenKey: "vaipizza_courier_refresh_token",
  });
});

test("customer restores authoritative order state after refresh and page reopen", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("vaipizza_customer_access_token", "qa-access-token");
    localStorage.setItem("vaipizza_customer_refresh_token", "qa-refresh-token");
  });

  await page.goto(`/orders/${fixture.orderId}`);
  await expect(page.getByText("Pedido efetuado", { exact: true })).toBeVisible();

  fixture.setStatus("PREPARING", false);
  await page.reload();
  await expect(page.getByText("Em preparação", { exact: true })).toBeVisible();
  await expect(page.getByText("Pedido efetuado", { exact: true })).not.toBeVisible();

  fixture.setStatus("OUT_FOR_DELIVERY", false);
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto(`/orders/${fixture.orderId}`);
  await expect(reopened.getByText("A caminho da sua morada", { exact: true })).toBeVisible();
  await expect(reopened.getByText("Em preparação", { exact: true })).not.toBeVisible();
});

test.describe("live staging refresh/reopen recovery", () => {
  test.skip(process.env.QA_STAGING_REFRESH !== "1", "Live staging recovery only runs in the guarded transport workflow");

  test("restores customer, Gestão, KDS and Estafeta without replaying transitions", async ({ browser, request }) => {
    const live = loadLiveFixture();
    const urls = {
      customer: requiredEnv("QA_CUSTOMER_URL"),
      restaurant: requiredEnv("QA_RESTAURANT_URL"),
      kds: requiredEnv("QA_KDS_URL"),
      courier: requiredEnv("QA_COURIER_URL"),
    };

    const sessions = {
      customer: await loginStagingSession(request, live.apiUrl, "customer", live.credentials.customer),
      restaurant: await loginStagingSession(request, live.apiUrl, "restaurant", live.credentials.restaurant),
      kds: await loginStagingSession(request, live.apiUrl, "kds", live.credentials.kds),
      courier: await loginStagingSession(request, live.apiUrl, "courier", live.credentials.courier),
    };

    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "NEW");

    const customerContext = await browser.newContext();
    const customerPage = await openSurface(
      customerContext,
      "customer",
      sessions.customer,
      `${urls.customer}/orders/${live.orderId}`,
    );
    await expect(customerPage.getByText("Pedido efetuado", { exact: true })).toBeVisible();
    await customerPage.reload();
    await expect(customerPage.getByText("Pedido efetuado", { exact: true })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "NEW");

    const restaurantContext = await browser.newContext();
    const restaurantPage = await openSurface(restaurantContext, "restaurant", sessions.restaurant, urls.restaurant);
    let restaurantCard = restaurantPage.locator(".order-card").filter({ hasText: `#${live.orderNumber}` });
    await expect(restaurantCard).toBeVisible();
    await expect(restaurantCard).toContainText("Novo");
    await restaurantPage.reload();
    restaurantCard = restaurantPage.locator(".order-card").filter({ hasText: `#${live.orderNumber}` });
    await expect(restaurantCard).toContainText("Novo");
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "NEW");

    await patchOrderStatus(request, live, sessions.restaurant.accessToken, "ACCEPTED");
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "PREPARING");
    await restaurantPage.reload();
    restaurantCard = restaurantPage.locator(".order-card").filter({ hasText: `#${live.orderNumber}` });
    await expect(restaurantCard).toContainText("Em preparação");
    await customerPage.reload();
    await expect(customerPage.getByText("Em preparação", { exact: true })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "PREPARING");

    const kdsContext = await browser.newContext();
    const kdsPage = await openSurface(kdsContext, "kds", sessions.kds, urls.kds);
    let ticket = kdsPage.locator("article.ticket").filter({ hasText: `#${live.orderNumber}` });
    await expect(ticket).toBeVisible();
    await expect(ticket.getByRole("button", { name: "PRONTO" })).toBeVisible();
    await kdsPage.reload();
    ticket = kdsPage.locator("article.ticket").filter({ hasText: `#${live.orderNumber}` });
    await expect(ticket).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "PREPARING");

    await patchOrderStatus(request, live, sessions.kds.accessToken, "READY_FOR_PICKUP");
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "WAITING_FOR_COURIER");
    await kdsPage.reload();
    await expect(kdsPage.locator("article.ticket").filter({ hasText: `#${live.orderNumber}` })).toHaveCount(0);

    const courierContext = await browser.newContext();
    let courierPage = await openSurface(courierContext, "courier", sessions.courier, urls.courier);
    const offer = courierPage.locator(".offer-card").filter({ hasText: `Pedido #${live.orderNumber}` });
    await expect(offer).toBeVisible();
    await expect(offer.getByRole("button", { name: "Aceitar entrega" })).toBeVisible();
    await courierPage.reload();
    await expect(courierPage.locator(".offer-card").filter({ hasText: `Pedido #${live.orderNumber}` })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "WAITING_FOR_COURIER");

    const assignmentResponse = await request.get(`${live.apiUrl.replace(/\/$/, "")}/api/courier/assignments/current`, {
      headers: { Authorization: `Bearer ${sessions.courier.accessToken}` },
    });
    expect(assignmentResponse.ok()).toBeTruthy();
    const assignmentBody = await assignmentResponse.json() as { assignment?: { id?: string } };
    const assignmentId = assignmentBody.assignment?.id;
    expect(assignmentId).toBeTruthy();

    await courierPage.close();
    courierPage = await courierContext.newPage();
    await courierPage.goto(urls.courier);
    await expect(courierPage.locator(".offer-card").filter({ hasText: `Pedido #${live.orderNumber}` })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "WAITING_FOR_COURIER");

    const acceptResponse = await request.post(
      `${live.apiUrl.replace(/\/$/, "")}/api/courier/assignments/${assignmentId}/accept`,
      { headers: { Authorization: `Bearer ${sessions.courier.accessToken}` } },
    );
    expect(acceptResponse.ok()).toBeTruthy();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "COURIER_ASSIGNED");

    await courierPage.reload();
    await expect(courierPage).toHaveURL(/\/delivery$/);
    await expect(courierPage.getByRole("heading", { name: "Recolher na VAIPIZZA" })).toBeVisible();
    await courierPage.reload();
    await expect(courierPage.getByRole("heading", { name: "Recolher na VAIPIZZA" })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "COURIER_ASSIGNED");

    await patchCourierOrderStatus(request, live, sessions.courier.accessToken, "PICKED_UP");
    await courierPage.reload();
    await expect(courierPage.getByRole("heading", { name: "Iniciar entrega" })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "PICKED_UP");

    await patchCourierOrderStatus(request, live, sessions.courier.accessToken, "OUT_FOR_DELIVERY");
    await courierPage.reload();
    await expect(courierPage.getByRole("heading", { name: "Entregar ao cliente" })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "OUT_FOR_DELIVERY");

    await courierPage.close();
    courierPage = await courierContext.newPage();
    await courierPage.goto(`${urls.courier}/delivery`);
    await expect(courierPage.getByRole("heading", { name: "Entregar ao cliente" })).toBeVisible();
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "OUT_FOR_DELIVERY");

    await patchCourierOrderStatus(request, live, sessions.courier.accessToken, "DELIVERED");
    await assertAuthoritativeOrderStatus(request, live, sessions.customer.accessToken, "DELIVERED");

    await Promise.all([
      customerContext.close(),
      restaurantContext.close(),
      kdsContext.close(),
      courierContext.close(),
    ]);
  });
});
