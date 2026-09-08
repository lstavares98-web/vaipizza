import { expect, test } from "@playwright/test";

test("shows the Matteo-inspired VaiPizza hero", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("region", { name: /promoções em destaque/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /hoje vai de pizza/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /promoção anterior/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /próxima promoção/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /pedir agora/i }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: /como quer receber/i })).toBeVisible();
});
