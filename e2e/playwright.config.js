import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,   // serial in CI to avoid race conditions
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL:          process.env.BASE_URL || "http://localhost:5173",
    headless:         true,
    screenshot:       "only-on-failure",
    video:            "retain-on-failure",
    trace:            "retain-on-failure",
    actionTimeout:    10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  outputDir: "test-results",
});
