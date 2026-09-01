import assert from "node:assert/strict";
import test from "node:test";
import { getPreparationElapsedMinutes, getTicketUrgency, getFulfillmentLabel } from "../src/lib/kdsPresentation.ts";

const now = new Date("2026-08-31T19:30:00.000Z").getTime();

test("uses PREPARING history as the preparation clock when available", () => {
  const elapsed = getPreparationElapsedMinutes(
    {
      createdAt: "2026-08-31T18:30:00.000Z",
      statusHistory: [
        { status: "NEW", createdAt: "2026-08-31T18:30:00.000Z" },
        { status: "PREPARING", createdAt: "2026-08-31T19:18:00.000Z" },
      ],
    },
    now,
  );
  assert.equal(elapsed, 12);
});

test("falls back to order creation time when preparation history is missing", () => {
  const elapsed = getPreparationElapsedMinutes({ createdAt: "2026-08-31T19:22:00.000Z", statusHistory: [] }, now);
  assert.equal(elapsed, 8);
});

test("classifies kitchen urgency without relying on color names", () => {
  assert.deepEqual(getTicketUrgency(4), { level: "normal", label: "No tempo" });
  assert.deepEqual(getTicketUrgency(11), { level: "attention", label: "Atenção" });
  assert.deepEqual(getTicketUrgency(18), { level: "late", label: "Atrasado" });
});

test("formats fulfillment type for kitchen staff", () => {
  assert.equal(getFulfillmentLabel("DELIVERY"), "Delivery");
  assert.equal(getFulfillmentLabel("PICKUP"), "Takeaway");
  assert.equal(getFulfillmentLabel(undefined), "Pedido");
});
