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
  reporter: "list",
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
    // The end-card specs mock the RPC, but a build with no credentials hides
    // the global-best line before any request is made, so the mock would never
    // fire and those specs could only pass on a machine that happened to have
    // a .env.local. Placeholders make isLeaderboardAvailable() true and leave
    // the mock in charge of the outcome.
    //
    // .invalid can never resolve (RFC 2606), so a spec that forgets to mock
    // fails fast instead of reaching a real leaderboard. Vite prefers real
    // process env over .env files, so these win locally too.
    env: {
      SUPABASE_URL: "https://leaderboard.test.invalid",
      SUPABASE_ANON_KEY: "playwright-anon-key",
    },
  },
});
