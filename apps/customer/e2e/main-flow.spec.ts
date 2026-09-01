import { expect, test } from "@playwright/test";

// End-to-end happy path for the core order flow described in
// PROJECT_ANALYSIS.md: customer logs in, lands straight on the (only)
// restaurant's menu, adds a product with modifiers to the cart, and checks
// out with cash on delivery. Requires a running API against a freshly
// seeded database (`npm run db:seed`) — the seed creates the demo account
// and the VaiPizza / Pizza Margherita fixtures this test relies on.
test("customer can browse, add a modified product to cart, and place an order", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("cliente@demo.local");
  await page.getByLabel("Palavra-passe").fill("Demo1234!");
  await page.getByRole("button", { name: "Entrar" }).click();

  // Login redirects straight into the permanent single-store ordering route.
  await expect(page).toHaveURL(/\/pedir$/);
  await expect(page.getByRole("heading", { name: "VaiPizza" })).toBeVisible();
  await page.getByRole("button", { name: /Pizza Margherita/ }).click();

  // Required "Tamanho" group defaults to "Média" — explicitly pick "Grande".
  // Clicking the label text toggles its wrapped radio/checkbox input.
  await page.getByText("Grande", { exact: false }).first().click();
  await page.getByText("Bacon", { exact: false }).first().click();

  await page.getByRole("button", { name: /Adicionar —/ }).click();
  await page.getByRole("link", { name: /Carrinho/ }).click();

  await expect(page.getByText("Pizza Margherita")).toBeVisible();
  await page.getByRole("link", { name: "Continuar para pagamento" }).click();

  await page.getByLabel("Recolha no restaurante").check();
  await page.getByLabel("Dinheiro na entrega").check();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();

  await expect(page).toHaveURL(/\/orders\//);
  await expect(page.getByText("Pedido efetuado")).toBeVisible();
});
