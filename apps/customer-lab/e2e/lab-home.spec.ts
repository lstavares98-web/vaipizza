import { expect, test } from "@playwright/test";

test("slides the whole hero campaign while keeping navigation and arrows fixed", async ({ page }) => {
  await page.goto("/");

  const hero = page.getByRole("region", { name: /promoções em destaque/i });
  const nextButton = page.getByRole("button", { name: /próxima promoção/i });
  const brand = page.getByRole("link", { name: /vaipizza — início/i });

  await expect(hero).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(page.getByRole("heading", { name: /hoje vai de pizza/i })).toBeVisible();
  await expect(nextButton).toBeVisible();

  await nextButton.click();

  await expect(page.getByRole("heading", { name: /duas pizzas um bom plano/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /hoje vai de pizza/i })).not.toBeVisible();
  await expect(brand).toBeVisible();
  await expect(nextButton).toBeVisible();

  await nextButton.click();

  await expect(page.getByRole("heading", { name: /monta a tua pizza/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /como quer receber/i })).toBeVisible();
});
