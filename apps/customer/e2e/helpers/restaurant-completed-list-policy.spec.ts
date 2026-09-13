import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const DASHBOARD_FILE = resolve(process.cwd(), "../restaurant/src/pages/OrdersDashboard.tsx");
const STYLES_FILE = resolve(process.cwd(), "../restaurant/src/index.css");

test("completed orders stay in a bounded scroll area", () => {
  const dashboard = readFileSync(DASHBOARD_FILE, "utf8");
  const styles = readFileSync(STYLES_FILE, "utf8");

  expect(dashboard).toContain('className="compact-list completed-orders-list"');
  expect(styles).toMatch(/\.completed-orders-list\s*\{[^}]*max-height:\s*360px;[^}]*overflow-y:\s*auto;/s);
});
