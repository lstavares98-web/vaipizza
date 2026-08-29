import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_ACCESS_SECRET: "test_access_secret_at_least_16_chars",
      JWT_REFRESH_SECRET: "test_refresh_secret_at_least_16_chars",
    },
  },
});
