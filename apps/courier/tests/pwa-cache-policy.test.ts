import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const headersSource = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

test("courier checks for a fresh service worker and reloads a stale controlled page", () => {
  assert.match(mainSource, /virtual:pwa-register/);
  assert.match(mainSource, /immediate:\s*true/);
  assert.match(mainSource, /onRegisteredSW/);
  assert.match(mainSource, /registration\.update\(\)/);
  assert.match(mainSource, /visibilitychange/);
  assert.match(mainSource, /controllerchange/);
  assert.match(mainSource, /window\.location\.reload\(\)/);
});

test("courier prevents browser caching of the app shell and service worker", () => {
  assert.match(headersSource, /\/sw\.js[\s\S]*?Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/i);
  assert.match(headersSource, /\/index\.html[\s\S]*?Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/i);
});
