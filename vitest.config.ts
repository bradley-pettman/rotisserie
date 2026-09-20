import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Unit tests only. `tests/` holds the Playwright E2E suite, which must not
    // be picked up by Vitest (it uses @playwright/test's own runner).
    include: ["app/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**", "build/**", ".react-router/**"],
    environment: "node",
  },
});
