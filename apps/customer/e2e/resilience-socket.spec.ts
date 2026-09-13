import { expect, test } from "@playwright/test";
import {
  startSocketRecoveryFixture,
  type SocketRecoveryFixture,
} from "./helpers/socket-control";

let fixture: SocketRecoveryFixture;

test.beforeAll(async () => {
  fixture = await startSocketRecoveryFixture();
});

test.afterAll(async () => {
  await fixture.close();
});

test("customer reconciles the authoritative order state after socket reconnect", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("vaipizza_customer_access_token", "qa-access-token");
    localStorage.setItem("vaipizza_customer_refresh_token", "qa-refresh-token");
  });

  await page.goto(`/orders/${fixture.orderId}`);
  await expect(page.getByText("Pedido efetuado", { exact: true })).toBeVisible();
  await fixture.waitForConnectedClients(1);

  await context.setOffline(true);
  await fixture.waitForConnectedClients(0);

  fixture.setStatus("PREPARING", true);

  await context.setOffline(false);
  await fixture.waitForConnectedClients(1);

  await expect(page.getByText("Em preparação", { exact: true })).toBeVisible({ timeout: 3_000 });
  await expect(page.getByText("Pedido efetuado", { exact: true })).not.toBeVisible();
});
