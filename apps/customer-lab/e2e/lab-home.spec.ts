import { expect, test } from "@playwright/test";

test("shows the new VaiPizza delivery-first home", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /pizza que dá vontade/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /como quer receber/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /ofertas vaipizza/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /pedir agora/i }).first()).toBeVisible();
});
