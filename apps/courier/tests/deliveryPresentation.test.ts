import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectionsUrl, getDeliveryStep } from "../src/lib/deliveryPresentation.ts";

test("buildDirectionsUrl creates a destination URL for Google Maps", () => {
  assert.equal(buildDirectionsUrl(41.5518, -8.4229), "https://www.google.com/maps/dir/?api=1&destination=41.5518%2C-8.4229");
});

test("getDeliveryStep presents one clear operational action per status", () => {
  assert.deepEqual(getDeliveryStep("COURIER_ASSIGNED"), {
    title: "Recolher na VAIPIZZA",
    label: "Confirmar recolha",
    next: "PICKED_UP",
    target: "restaurant",
  });
  assert.deepEqual(getDeliveryStep("PICKED_UP"), {
    title: "Iniciar entrega",
    label: "A caminho do cliente",
    next: "OUT_FOR_DELIVERY",
    target: "customer",
  });
  assert.deepEqual(getDeliveryStep("OUT_FOR_DELIVERY"), {
    title: "Entregar ao cliente",
    label: "Confirmar entrega",
    next: "DELIVERED",
    target: "customer",
  });
  assert.equal(getDeliveryStep("DELIVERED"), null);
});
