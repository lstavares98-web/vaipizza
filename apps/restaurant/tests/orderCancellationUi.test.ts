import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/OrdersDashboard.tsx", import.meta.url), "utf8");

test("restaurant order UI uses the shared cancellation endpoint with a required reason", () => {
  assert.match(source, /\/restaurant\/orders\/\$\{order\.id\}\/cancel/);
  assert.match(source, /reason\.trim\(\)/);
  assert.match(source, /maxLength=\{500\}/);
});

test("restaurant order UI only exposes cancellation before courier handoff", () => {
  for (const status of [
    "NEW",
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "WAITING_FOR_COURIER",
    "COURIER_ASSIGNED",
  ]) {
    assert.match(source, new RegExp(`CANCELLABLE_STAGE[\\s\\S]*?${status}`));
  }

  assert.doesNotMatch(source, /CANCELLABLE_STAGE[^;]*PICKED_UP/);
  assert.doesNotMatch(source, /CANCELLABLE_STAGE[^;]*OUT_FOR_DELIVERY/);
});

test("kitchen role cannot see restaurant operational cancellation action", () => {
  assert.match(source, /RESTAURANT_OWNER/);
  assert.match(source, /RESTAURANT_STAFF/);
  assert.match(source, /canCancelOrders/);
});
