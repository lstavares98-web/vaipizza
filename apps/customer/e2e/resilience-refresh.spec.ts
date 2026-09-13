import { expect, test } from "@playwright/test";
import {
  startSocketRecoveryFixture,
  type SocketRecoveryFixture,
} from "./helpers/socket-control";
import { getStagingSessionSurface } from "./helpers/staging-sessions";

let fixture: SocketRecoveryFixture;

test.beforeAll(async () => {
  fixture = await startSocketRecoveryFixture();
});

test.afterAll(async () => {
  await fixture.close();
});

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
