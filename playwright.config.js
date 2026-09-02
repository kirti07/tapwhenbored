import { defineConfig, devices } from "@playwright/test";

// Dev and preview serve identical URLs (ARCHITECTURE.md §5), so the same specs
// run against either. Default to preview, because dev mode is not sufficient
// for final verification (GAME-TESTING.md §18).
const baseURL = process.env.PW_BASE_URL || "http://localhost:4173";
const isDev = baseURL.includes("5173");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL,
    // Every game URL is a real document, so always navigate with the trailing
    // slash the canonical uses.
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    // `preview` builds first, so this always tests fresh output.
    command: isDev ? "npm run dev" : "npm run preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
