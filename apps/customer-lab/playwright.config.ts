import { defineConfig, devices } from "@playwright/test";

// Requires the API (with a seeded Postgres) and this app's dev server
// both running — see README "Testar o fluxo principal". Playwright starts
// the customer-lab dev server itself; start `npm run dev:api` separately.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3100,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
