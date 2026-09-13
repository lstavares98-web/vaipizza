import { defineConfig, devices } from "@playwright/test";

const liveRefreshRecovery = process.env.QA_STAGING_REFRESH === "1";

// Requires the API (with a seeded Postgres) and this app's dev server
// both running — see README "Testar o fluxo principal". Playwright starts
// the customer dev server itself; start `npm run dev:api` separately.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: liveRefreshRecovery ? "retain-on-failure" : "on-first-retry",
    screenshot: liveRefreshRecovery ? "only-on-failure" : "off",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
  ],
});
