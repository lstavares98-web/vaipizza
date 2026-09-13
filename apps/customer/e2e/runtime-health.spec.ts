import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForOrderStatus } from "./helpers/api-audit";
import { loadQaRuntime } from "./helpers/qa-runtime";
import { startRuntimeHealthAudit, type RuntimeHealthAudit, type RuntimeIssue } from "./helpers/runtime-errors";
import { installBrowserSurfaceSessions, loadBrowserUiFixture } from "./helpers/surface-login";

interface SurfaceAudit {
  surface: "customer" | "restaurant" | "kds" | "courier";
  audit: RuntimeHealthAudit;
}

async function expectReachable(page: Page, locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} should be visible`).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${label} should have a layout box`).not.toBeNull();
  expect(viewport, `${label} requires a known viewport`).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x + box.width, `${label} should intersect the viewport horizontally`).toBeGreaterThan(0);
  expect(box.x, `${label} should not sit beyond the right edge`).toBeLessThan(viewport.width);
  expect(box.y + box.height, `${label} should intersect the viewport vertically`).toBeGreaterThan(0);
  expect(box.y, `${label} should not sit below the viewport after normal scrolling`).toBeLessThan(viewport.height);

  const hit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const target = document.elementFromPoint(x, y);
    return Boolean(target && (target === element || element.contains(target)));
  });
  expect(hit, `${label} should not be covered by another element`).toBe(true);
}

function assertNoUnexpectedRuntimeIssues(audits: SurfaceAudit[]): void {
  const failures = audits.flatMap(({ surface, audit }) =>
    audit.unexpected().map((issue): RuntimeIssue & { surface: SurfaceAudit["surface"] } => ({ surface, ...issue })),
  );
  for (const { audit } of audits) audit.stop();
  expect(failures, `Unexpected browser runtime issues:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

test.describe("live staging runtime health and responsive critical controls", () => {
  test.skip(process.env.QA_STAGING_RUNTIME !== "1", "Live runtime health QA only runs in the guarded browser workflow");

  test("customer, Gestão, KDS and Estafeta stay healthy and actionable through the delivery path", async ({ context, request }) => {
    test.setTimeout(150_000);
    const urls = loadQaRuntime(process.env);
    const fixture = loadBrowserUiFixture();
    const sessions = await installBrowserSurfaceSessions(request, context, fixture);
    const audits: SurfaceAudit[] = [];

    const customerPage = await context.newPage();
    audits.push({ surface: "customer", audit: startRuntimeHealthAudit(customerPage) });
    await customerPage.goto(`${urls.customerUrl}/orders/${fixture.orderId}`);
    await expectReachable(customerPage, customerPage.getByText("Pedido efetuado", { exact: true }), "customer NEW status");
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "NEW");

    const restaurantPage = await context.newPage();
    audits.push({ surface: "restaurant", audit: startRuntimeHealthAudit(restaurantPage) });
    await restaurantPage.goto(urls.restaurantUrl);
    let restaurantCard = restaurantPage.locator(".order-card").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(restaurantCard).toContainText("Novo");
    const acceptOrder = restaurantCard.getByRole("button", { name: "Aceitar", exact: true });
    const rejectOrder = restaurantCard.getByRole("button", { name: "Rejeitar", exact: true });
    await expectReachable(restaurantPage, acceptOrder, "Gestão Aceitar");
    await expectReachable(restaurantPage, rejectOrder, "Gestão Rejeitar");
    await acceptOrder.click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "PREPARING");

    await customerPage.reload();
    await expectReachable(customerPage, customerPage.getByText("Em preparação", { exact: true }), "customer PREPARING status");
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "PREPARING");

    const kdsPage = await context.newPage();
    audits.push({ surface: "kds", audit: startRuntimeHealthAudit(kdsPage) });
    await kdsPage.goto(urls.kdsUrl);
    let ticket = kdsPage.locator("article.ticket").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(ticket).toBeVisible();
    const readyButton = ticket.getByRole("button", { name: "PRONTO" });
    await expectReachable(kdsPage, readyButton, "KDS PRONTO");
    await readyButton.click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "WAITING_FOR_COURIER");

    await kdsPage.reload();
    ticket = kdsPage.locator("article.ticket").filter({ hasText: `#${fixture.orderNumber}` });
    await expect(ticket).toHaveCount(0);
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "WAITING_FOR_COURIER");

    const courierPage = await context.newPage();
    audits.push({ surface: "courier", audit: startRuntimeHealthAudit(courierPage) });
    await courierPage.goto(urls.courierUrl);
    const offer = courierPage.locator(".offer-card").filter({ hasText: `Pedido #${fixture.orderNumber}` });
    await expect(offer).toBeVisible();
    const acceptDelivery = offer.getByRole("button", { name: "Aceitar entrega" });
    await expectReachable(courierPage, acceptDelivery, "Estafeta Aceitar entrega");
    await acceptDelivery.click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "COURIER_ASSIGNED");
    await expect(courierPage).toHaveURL(/\/delivery$/);

    await expectReachable(courierPage, courierPage.getByRole("button", { name: "Confirmar recolha" }), "Estafeta Confirmar recolha");
    await courierPage.getByRole("button", { name: "Confirmar recolha" }).click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "PICKED_UP");

    await expectReachable(courierPage, courierPage.getByRole("button", { name: "A caminho do cliente" }), "Estafeta iniciar entrega");
    await courierPage.getByRole("button", { name: "A caminho do cliente" }).click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "OUT_FOR_DELIVERY");

    await expectReachable(courierPage, courierPage.getByRole("button", { name: "Confirmar entrega" }), "Estafeta Confirmar entrega");
    await courierPage.getByRole("button", { name: "Confirmar entrega" }).click();
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "DELIVERED");

    await customerPage.reload();
    await expectReachable(customerPage, customerPage.getByText("Entregue", { exact: true }), "customer DELIVERED status");
    await waitForOrderStatus(request, fixture, sessions.customer.accessToken, "DELIVERED");

    assertNoUnexpectedRuntimeIssues(audits);
    await Promise.all([customerPage.close(), restaurantPage.close(), kdsPage.close(), courierPage.close()]);
  });
});
