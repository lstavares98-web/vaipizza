import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");
const dispatchService = readFileSync(resolve(repoRoot, "apps/api/src/modules/dispatch/dispatch.service.ts"), "utf8");
const courierService = readFileSync(resolve(repoRoot, "apps/api/src/modules/couriers/courier.service.ts"), "utf8");
const courierRoutes = readFileSync(resolve(repoRoot, "apps/api/src/modules/couriers/courier.routes.ts"), "utf8");
const activeDelivery = readFileSync(resolve(repoRoot, "apps/courier/src/pages/ActiveDelivery.tsx"), "utf8");
const courierOps = readFileSync(resolve(repoRoot, "apps/restaurant/src/components/CourierOperationsPanel.tsx"), "utf8");

describe("queued next delivery wiring", () => {
  it("only falls back to a busy courier after normal free dispatch", () => {
    expect(dispatchService).toContain("findNearestBusyCourier");
    expect(dispatchService).toContain("shouldConsiderBusyCouriers");
  });

  it("reserves the next order without replacing the active order", () => {
    expect(dispatchService).toContain('"assignment:reserved"');
    expect(dispatchService).toContain('status: "WAITING_FOR_COURIER"');
  });

  it("promotes an accepted reservation when the active delivery finishes", () => {
    expect(courierService).toContain("getNextReservedOrder");
    expect(courierService).toContain('status: "COURIER_ASSIGNED"');
    expect(courierService).toContain('"assignment:promoted"');
  });

  it("exposes the reserved next order to the courier app", () => {
    expect(courierRoutes).toContain('"/orders/next"');
    expect(activeDelivery).toContain("Próxima entrega reservada");
    expect(activeDelivery).toContain('"/courier/orders/next"');
  });

  it("shows active and next jobs separately in Gestão", () => {
    expect(courierOps).toContain("nextOrder");
    expect(courierOps).toContain("Próxima #");
  });
});
