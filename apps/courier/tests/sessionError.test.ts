import assert from "node:assert/strict";
import test from "node:test";
import { courierSessionTerminationMessage } from "../src/lib/sessionError.ts";

test("courierSessionTerminationMessage explains when another device replaced the session", () => {
  assert.equal(
    courierSessionTerminationMessage("COURIER_SESSION_REPLACED"),
    "A sua conta foi iniciada noutro dispositivo.",
  );
});

test("courierSessionTerminationMessage ignores unrelated API errors", () => {
  assert.equal(courierSessionTerminationMessage("UNAUTHORIZED"), null);
  assert.equal(courierSessionTerminationMessage(undefined), null);
});
