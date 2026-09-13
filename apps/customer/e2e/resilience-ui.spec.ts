import { expect, test } from "@playwright/test";
import { loadQaRuntime } from "./helpers/qa-runtime";
import {
  installBrowserSurfaceSessions,
  loadBrowserUiFixture,
} from "./helpers/surface-login";
import {
  setCourierOrderStatus,
  waitForOrderStatus,
} from "./helpers/api-audit";

test.describe("live staging UI state agreement", () => {
  test.skip(process.env.QA_STAGING_UI !== "1", "Live staging UI QA only runs in the guarded browser workflow");

  test("Customer, Gestão, KDS and Estafeta agree with the authoritative order state", async ({ context, request }) => {
    test.setTimeout(120_000);

    const urls = loadQaRuntime(process.env);
    const fixture = loadBrowserUiFixture();
    const sessions = await installBrowserSurfaceSessions(request, context, fixture);
    const customerPageErrors: string[] = [];

    const customerPage = await context.newPage();
    customerPage.on("pageerror", (error) => customerPageErrors.push(error.message));
    await customerPage.goto(`${urls.customerUrl}/orders/${fixture.orderId}`);
    await expect(customerPage.getByText("Pedido efetuado", { exact: true })).toBeVisible();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "NEW");

    const restaurantPage = await context.newPage();
    await restaurantPage.goto(urls.restaurantUrl);
    let restaurantCard = restaurantPage.locator(".order-card").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(restaurantCard).toBeVisible();
    await expect(restaurantCard).toContainText("Novo");
    const acceptOrder = restaurantCard.getByRole("button", { name: "Aceitar", exact: true });
    await expect(acceptOrder).toBeVisible();
    await expect(acceptOrder).toBeEnabled();
    await acceptOrder.click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "PREPARING");

    await restaurantPage.reload();
    restaurantCard = restaurantPage.locator(".order-card").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(restaurantCard).toContainText("Em preparação");
    await customerPage.reload();
    await expect(customerPage.getByText("Em preparação", { exact: true })).toBeVisible();

    const kdsPage = await context.newPage();
    await kdsPage.goto(urls.kdsUrl);
    let ticket = kdsPage.locator("article.ticket").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(ticket).toBeVisible();
    const readyButton = ticket.getByRole("button", { name: "PRONTO" });
    await expect(readyButton).toBeVisible();
    await expect(readyButton).toBeEnabled();
    await readyButton.click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "WAITING_FOR_COURIER");

    await kdsPage.reload();
    ticket = kdsPage.locator("article.ticket").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(ticket).toHaveCount(0);

    const courierPage = await context.newPage();
    await courierPage.goto(urls.courierUrl);
    const offer = courierPage.locator(".offer-card").filter({ hasText: `Pedido #${fixture.orderNumber}` });
    await expect(offer).toBeVisible();
    const acceptDelivery = offer.getByRole("button", { name: "Aceitar entrega" });
    await expect(acceptDelivery).toBeVisible();
    await expect(acceptDelivery).toBeEnabled();
    await acceptDelivery.click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "COURIER_ASSIGNED");

    await expect(courierPage).toHaveURL(/\/delivery$/);
    await expect(courierPage.getByRole("heading", { name: "Recolher na VAIPIZZA" })).toBeVisible();
    await expect(courierPage.locator(".offer-card").filter({ hasText: `Pedido #${fixture.orderNumber}` })).toHaveCount(0);

    await setCourierOrderStatus(request, fixture, sessions.courier.accessToken, "PICKED_UP");
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "PICKED_UP");
    await setCourierOrderStatus(request, fixture, sessions.courier.accessToken, "OUT_FOR_DELIVERY");
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "OUT_FOR_DELIVERY");
    await setCourierOrderStatus(request, fixture, sessions.courier.accessToken, "DELIVERED");
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "DELIVERED");

    await customerPage.reload();
    await expect(customerPage.getByText("Entregue", { exact: true })).toBeVisible();
    expect(customerPageErrors).toEqual([]);
  });
});
