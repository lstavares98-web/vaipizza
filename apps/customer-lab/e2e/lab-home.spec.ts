import { expect, test } from "@playwright/test";

test("keeps the campaign copy fixed while the pizza images slide", async ({ page }) => {
  await page.goto("/");

  const heading = page.getByRole("heading", { name: /hoje vai de pizza/i });
  const frontPizza = page.locator(".matteo-pizza-front img");

  await expect(page.getByRole("region", { name: /promoções em destaque/i })).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(page.getByRole("button", { name: /promoção anterior/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /próxima promoção/i })).toBeVisible();

  const firstPizzaSrc = await frontPizza.getAttribute("src");
  await page.getByRole("button", { name: /próxima promoção/i }).click();

  await expect(heading).toBeVisible();
  await expect(frontPizza).not.toHaveAttribute("src", firstPizzaSrc ?? "");
  await expect(page.getByRole("link", { name: /pedir agora/i }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: /como quer receber/i })).toBeVisible();
});
