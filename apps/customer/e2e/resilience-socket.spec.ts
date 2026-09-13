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

test("customer reconciles authoritative order state after repeated socket reconnects", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("vaipizza_customer_access_token", "qa-access-token");
    localStorage.setItem("vaipizza_customer_refresh_token", "qa-refresh-token");
  });

  await page.goto(`/orders/${fixture.orderId}`);
  await expect(page.getByText("Pedido efetuado", { exact: true })).toBeVisible();
  await fixture.waitForConnectedClients(1);

  const transitions = [
    ["PREPARING", "Em preparação"],
    ["WAITING_FOR_COURIER", "À procura de estafeta"],
    ["COURIER_ASSIGNED", "Estafeta a caminho do restaurante"],
    ["PICKED_UP", "Estafeta recolheu o pedido"],
    ["OUT_FOR_DELIVERY", "A caminho da sua morada"],
    ["DELIVERED", "Entregue"],
  ] as const;

  let previousLabel = "Pedido efetuado";
  for (const [status, expectedLabel] of transitions) {
    fixture.dropClientTransports();
    await fixture.waitForConnectedClients(0);

    fixture.setStatus(status, true);
    await fixture.waitForConnectedClients(1);

    await expect(page.getByText(expectedLabel, { exact: true })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(previousLabel, { exact: true })).not.toBeVisible();
    previousLabel = expectedLabel;
  }
});
