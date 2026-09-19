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
    // CI exercises the production bundle and `react-router-serve`'s SSR path,
    // so a broken production build fails CI instead of passing silently.
    // Locally it stays on the dev server: HMR, and no rebuild per run.
    //
    // PORT=5173 is not optional. `react-router-serve` reads `process.env.PORT`
    // and otherwise asks `get-port` for 3000 — and `get-port` falls back to an
    // arbitrary free port when 3000 is taken, so without PORT the server can
    // land anywhere and `baseURL` below stops pointing at it.
    command: process.env.CI ? "npm run build && PORT=5173 npm run start" : "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    // Covers the production build as well as server start on the CI path. A
    // cold `npm run build` measures ~6s here and the built server listens in
    // ~1s; 120s was already generous for that, but a cold CI runner (no Vite
    // cache, slower disk, npm ci just finished) is several times slower, so
    // this leaves room for that without ever waiting 180s on a healthy run —
    // the timeout only bounds the failure case.
    timeout: 180000,
    // The server must read and write the same database the tests clean up.
    // tests/db.ts resolves this from DATABASE_URL, a local .env, or the
    // docker-compose default, in that order.
    env: { DATABASE_URL },
  },
});
