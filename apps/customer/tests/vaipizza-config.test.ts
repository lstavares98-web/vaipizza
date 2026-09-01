import assert from "node:assert/strict";
import test from "node:test";
import { resolvePrimaryRestaurant, VAIPIZZA } from "../src/config/vaipizza.ts";

test("VAIPIZZA points ordering traffic to the permanent /pedir route", () => {
  assert.equal(VAIPIZZA.slug, "vaipizza");
  assert.equal(VAIPIZZA.orderPath, "/pedir");
});

test("resolvePrimaryRestaurant prefers the VAIPIZZA slug", () => {
  const restaurants = [{ slug: "demo" }, { slug: "vaipizza" }, { slug: "other" }];
  assert.equal(resolvePrimaryRestaurant(restaurants)?.slug, "vaipizza");
});

test("resolvePrimaryRestaurant falls back to the first restaurant and handles an empty list", () => {
  assert.equal(resolvePrimaryRestaurant([{ slug: "legacy" }])?.slug, "legacy");
  assert.equal(resolvePrimaryRestaurant([]), null);
});
