import assert from "node:assert/strict";
import test from "node:test";
import { getCourierIndicatorState } from "../src/lib/courierIndicator";

test("offline courier uses neutral indicator", () => {
  assert.equal(getCourierIndicatorState("OFFLINE", false), "offline");
});

test("online eligible courier uses green indicator", () => {
  assert.equal(getCourierIndicatorState("AVAILABLE", true), "eligible");
  assert.equal(getCourierIndicatorState("GOING_TO_RESTAURANT", true), "eligible");
});

test("online but ineligible courier uses red indicator", () => {
  assert.equal(getCourierIndicatorState("AVAILABLE", false), "blocked");
  assert.equal(getCourierIndicatorState("GOING_TO_RESTAURANT", false), "blocked");
});
