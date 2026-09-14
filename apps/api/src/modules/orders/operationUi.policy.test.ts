import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");
const customerOrderDetail = readFileSync(resolve(repoRoot, "apps/customer/src/pages/OrderDetail.tsx"), "utf8");
const restaurantOrders = readFileSync(resolve(repoRoot, "apps/restaurant/src/pages/OrdersDashboard.tsx"), "utf8");
const restaurantSettings = readFileSync(resolve(repoRoot, "apps/restaurant/src/pages/Settings.tsx"), "utf8");

describe("approved pickup and MB WAY UI contract", () => {
  it("shows a prominent ready-for-pickup customer message", () => {
    expect(customerOrderDetail).toContain("O seu pedido está pronto para recolha");
  });

  it("lets the customer see MB WAY instructions and open WhatsApp for proof", () => {
    expect(customerOrderDetail).toContain("Enviar comprovativo pelo WhatsApp");
    expect(customerOrderDetail).toContain("mbwayPhone");
  });

  it("lets Gestão confirm MB WAY and close a pickup order as collected", () => {
    expect(restaurantOrders).toContain("confirm-mbway-payment");
    expect(restaurantOrders).toContain('status: "COLLECTED"');
  });

  it("lets the restaurant configure a dedicated MB WAY number", () => {
    expect(restaurantSettings).toContain("mbwayPhone");
    expect(restaurantSettings).toContain("Número MB WAY");
  });
});
