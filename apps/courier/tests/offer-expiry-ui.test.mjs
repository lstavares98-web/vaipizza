import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../src/pages/Home.tsx", import.meta.url), "utf8");
const activeDelivery = readFileSync(new URL("../src/pages/ActiveDelivery.tsx", import.meta.url), "utf8");

test("home removes an expired offer immediately instead of leaving a dead card", () => {
  assert.match(
    home,
    /if \(assignment && secondsLeft === 0\) \{\s*setAssignment\(null\);\s*\}/s,
  );
});

test("active delivery removes an expired queued offer immediately instead of leaving a dead card", () => {
  assert.match(
    activeDelivery,
    /if \(nextAssignment\?\.status === "OFFERED" && nextSecondsLeft === 0\) \{\s*setNextAssignment\(null\);\s*\}/s,
  );
});
