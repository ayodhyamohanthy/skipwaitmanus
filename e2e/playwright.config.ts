// GATE-e2e-journeys (D-212): the core journeys in a real browser against the
// real server and MySQL. `pnpm e2e` runs them; scripts/e2e-server.mjs prepares
// the database (`prepare`, run once before) and starts the server (`start`,
// run here by the webServer block). Vitest never collects these files: its
// include list is explicit and they end in .e2e.ts.
import { defineConfig, devices } from "playwright/test";

const port = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  outputDir: "./.results",
  // One shared database and one seeded referrer: journeys run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "./.report" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // The app's service worker would answer navigations itself and hide them
    // from the dev sign-in route below.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node scripts/e2e-server.mjs start",
    cwd: "..",
    url: `http://127.0.0.1:${port}/api/plans/catalog`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
