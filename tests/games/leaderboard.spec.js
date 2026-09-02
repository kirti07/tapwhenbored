// The shared leaderboard, and — more importantly — what happens when it fails.
//
// GAME-TESTING.md §13 is unambiguous: a leaderboard or network failure must not
// break the game. That matters more than usual here because both call sites use
// a bare .then() with no .catch(), so a rejected promise would abort the rest of
// the game-over handler and cost the player their overlay and replay button.
// These tests exercise abort, 500, and a hang against the real pages.

import { test, expect } from "@playwright/test";
import { games } from "../../src/data/games.js";

const RPC = "**/rest/v1/rpc/**";
const withLeaderboard = games.filter((g) => g.leaderboard);
const withoutLeaderboard = games.filter((g) => !g.leaderboard);

/** Fails the test on an uncaught exception or unhandled rejection. */
function failOnUncaught(page) {
  const seen = [];
  page.on("pageerror", (e) => seen.push(e.message));
  return () => seen;
}

test("the module is wired into exactly the games that declare it", async ({ page }) => {
  // A game with leaderboard: false must never contact Supabase
  // (ARCHITECTURE.md §27), and the registry is the source of that claim.
  for (const g of withoutLeaderboard) {
    const calls = [];
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/")) calls.push(r.url());
    });
    await page.goto(g.path);
    await page.waitForTimeout(400);
    expect(calls, `${g.slug} must not talk to Supabase`).toEqual([]);
    page.removeAllListeners("request");
  }
});

for (const g of withLeaderboard) {
  test.describe(`${g.slug} survives leaderboard failure`, () => {
    for (const [label, handler] of [
      ["the network is unreachable", (route) => route.abort()],
      ["the server returns 500", (route) => route.fulfill({ status: 500, body: "" })],
      [
        "the response is not a number",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"code":"PGRST202"}',
          }),
      ],
    ]) {
      test(label, async ({ page }) => {
        const uncaught = failOnUncaught(page);
        await page.route(RPC, handler);
        await page.goto(g.path);
        await page.waitForTimeout(500);

        // The page must remain fully interactive: this is the whole point.
        await expect(page.locator(".back-link")).toBeVisible();
        await expect(page.locator("#shareBtn")).toHaveCount(1);
        if (g.hasRestart) await expect(page.locator("#restartBtn")).toBeEnabled();
        expect(uncaught(), "no uncaught errors").toEqual([]);
      });
    }

    test("a hanging request does not block the page", async ({ page }) => {
      const uncaught = failOnUncaught(page);
      // Never resolve: the module's own 4s timeout must be what ends this.
      await page.route(RPC, () => {});
      await page.goto(g.path);
      await page.waitForTimeout(500);

      await expect(page.locator(".back-link")).toBeVisible();
      // Navigation still works while a leaderboard request is outstanding.
      await page.locator(".back-link").click();
      await expect(page).toHaveURL(/\/$/);
      expect(uncaught()).toEqual([]);
    });
  });
}

test("a game plays with no credentials configured", async ({ page }) => {
  // Blocking Supabase entirely is the closest a built page can get to an
  // unconfigured build: either way submitScore resolves null and the game must
  // be unaffected.
  const uncaught = failOnUncaught(page);
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto("/honeycomb/");
  await page.waitForTimeout(400);

  await expect(page.locator("#board .tile").first()).toBeVisible();
  await page.locator("#board .tile--tappable").first().click();
  await expect(page.locator("#timeVal")).not.toHaveText("0:00", { timeout: 3000 });
  expect(uncaught()).toEqual([]);
});
