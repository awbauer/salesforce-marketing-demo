import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: {
    command: "NORTHSTAR_E2E=1 XDG_CONFIG_HOME=/tmp/northstar-wrangler pnpm dev --host 127.0.0.1",
    url: "http://127.0.0.1:5173/api/health",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "chrome" } },
  ],
});
