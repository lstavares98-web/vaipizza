import { expect, test, type APIRequestContext } from "@playwright/test";
import { loadQaRuntime } from "./helpers/qa-runtime";
import { installBrowserSurfaceSessions, loadBrowserUiFixture, type BrowserUiFixture } from "./helpers/surface-login";

type OrderListBody = { orders?: Array<{ id: string; orderNumber?: number; status?: string }> };

async function listCustomerOrderIds(
  request: APIRequestContext,
  fixture: BrowserUiFixture,
  accessToken: string,
): Promise<string[]> {
  const response = await request.get(`${fixture.apiUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as OrderListBody;
  return (body.orders ?? []).map((order) => order.id);
}

async function clearAndSeedCart(
  request: APIRequestContext,
  fixture: BrowserUiFixture,
  accessToken: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const clear = await request.delete(`${fixture.apiUrl}/api/cart`, { headers });
  expect(clear.ok()).toBeTruthy();
  const add = await request.post(`${fixture.apiUrl}/api/cart/items`, {
    headers,
    data: {
      productId: fixture.productId,
      quantity: 1,
      modifierOptionIds: [],
      notes: "[QA offline]",
    },
  });
  expect(add.ok()).toBeTruthy();
}

async function openCheckout(page: import("@playwright/test").Page, customerUrl: string, addressId: string) {
  await page.goto(`${customerUrl}/checkout`);
  await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar pedido" })).toBeVisible();
  await expect(page.locator(`select option[value="${addressId}"]`)).toHaveCount(1);
}

function expectExactlyOneNewOrder(before: string[], after: string[]): string {
  const beforeSet = new Set(before);
  const added = after.filter((id) => !beforeSet.has(id));
  expect(added).toHaveLength(1);
  expect(new Set(after).size).toBe(after.length);
  return added[0]!;
}

test.describe("live staging customer offline and reconnect safety", () => {
  test.skip(process.env.QA_STAGING_OFFLINE !== "1", "Live offline QA only runs in the guarded browser workflow");

  test("offline before checkout never confirms an order and deliberate online retry creates exactly one", async ({ context, request, page }) => {
    test.setTimeout(120_000);
    const urls = loadQaRuntime(process.env);
    const fixture = loadBrowserUiFixture();
    const sessions = await installBrowserSurfaceSessions(request, context, fixture);

    await clearAndSeedCart(request, fixture, sessions.customer.accessToken);
    const before = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    await openCheckout(page, urls.customerUrl, fixture.addressId);

    await context.setOffline(true);
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByText("Não foi possível finalizar o pedido", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByText("Pedido efetuado", { exact: true })).toHaveCount(0);

    const whileOffline = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    expect(new Set(whileOffline)).toEqual(new Set(before));

    await context.setOffline(false);
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    const afterRetry = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    const createdId = expectExactlyOneNewOrder(before, afterRetry);
    expect(page.url()).toContain(`/orders/${createdId}`);
  });

  test("lost checkout response stays unconfirmed until authoritative reread and recovery does not duplicate", async ({ context, request, page }) => {
    test.setTimeout(120_000);
    const urls = loadQaRuntime(process.env);
    const fixture = loadBrowserUiFixture();
    const sessions = await installBrowserSurfaceSessions(request, context, fixture);

    await clearAndSeedCart(request, fixture, sessions.customer.accessToken);
    const before = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    await openCheckout(page, urls.customerUrl, fixture.addressId);

    let serverExecutedCheckout = false;
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      serverExecutedCheckout = true;
      await route.abort("failed");
    });

    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByText("Não foi possível finalizar o pedido", { exact: true })).toBeVisible();
    expect(serverExecutedCheckout).toBe(true);
    await expect(page).toHaveURL(/\/checkout$/);
    await page.unroute("**/api/orders");

    const afterLostResponse = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    const createdId = expectExactlyOneNewOrder(before, afterLostResponse);

    await page.reload();
    await expect(page.getByRole("heading", { name: "O carrinho está vazio" })).toBeVisible();
    const afterReconcile = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    expect(afterReconcile.filter((id) => id === createdId)).toHaveLength(1);
    expect(afterReconcile).toHaveLength(afterLostResponse.length);
  });

  test("cart reopen while offline is transparent and reconnect restores authoritative cart without creating an order", async ({ context, request, page }) => {
    test.setTimeout(120_000);
    const urls = loadQaRuntime(process.env);
    const fixture = loadBrowserUiFixture();
    const sessions = await installBrowserSurfaceSessions(request, context, fixture);

    await clearAndSeedCart(request, fixture, sessions.customer.accessToken);
    const before = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    await openCheckout(page, urls.customerUrl, fixture.addressId);

    await context.setOffline(true);
    let offlineReloadFailedTransparently = false;
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect(page.getByText("Pedido efetuado", { exact: true })).toHaveCount(0);
    } catch (error) {
      offlineReloadFailedTransparently = /ERR_INTERNET_DISCONNECTED|Timeout/i.test(String(error));
      expect(offlineReloadFailedTransparently).toBe(true);
    }

    const whileOffline = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    expect(new Set(whileOffline)).toEqual(new Set(before));

    await context.setOffline(false);
    await page.goto(`${urls.customerUrl}/checkout`);
    await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar pedido" })).toBeVisible();
    const afterReconnect = await listCustomerOrderIds(request, fixture, sessions.customer.accessToken);
    expect(new Set(afterReconnect)).toEqual(new Set(before));
  });
});
