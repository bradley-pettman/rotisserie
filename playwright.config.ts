import { defineConfig, devices } from "@playwright/test";

import { DATABASE_URL } from "./tests/db";

export default defineConfig({
  testDir: "./tests",
  // These tests share one database and are not parallel-safe: several of them
  // assert on the contents of the recipe list, which every other test writes to.
  // Isolation here is per-test cleanup (tests/fixtures.ts), not per-worker data.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // `list` for readable output in a terminal or a CI log; the HTML report is
  // still written, but never auto-served — that would hang a CI job.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // The dev server must read and write the same database the tests clean up.
    // tests/db.ts resolves this from DATABASE_URL, a local .env, or the
    // docker-compose default, in that order.
    env: { DATABASE_URL },
  },
});
