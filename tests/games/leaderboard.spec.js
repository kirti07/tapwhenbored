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

// ---------------------------------------------------------------------------
// The end card, with the RPC mocked.
//
// marble-nostalgia is the only game whose end state is reachable by playing,
// without writing a solver, so it is where the global-best line can actually be
// observed. Mocking submit_game_score also covers the happy path without
// depending on the database being migrated.
// ---------------------------------------------------------------------------

/**
 * Plays to a finished board and returns whether the end overlay appeared.
 *
 * Sweeps marbles in order and takes the first legal jump, rather than picking
 * at random: peg solitaire always terminates because every jump removes a
 * marble, so a deterministic sweep finishes in a few seconds. Selecting a
 * marble marks its legal moves synchronously, so the target check must NOT
 * wait — an earlier version waited 250ms per miss and blew the test timeout.
 */
async function playToEnd(page) {
  await expect(page.locator(".marble").first()).toBeVisible();
  const overlay = page.locator("#overlay.show");
  const targets = page.locator(".hole.valid-target");

  for (let round = 0; round < 60; round++) {
    if (await overlay.count()) break;

    const marbles = page.locator(".marble");
    const n = await marbles.count();
    if (n <= 1) break;

    let jumped = false;
    for (let i = 0; i < n; i++) {
      await marbles.nth(i).click({ force: true }).catch(() => {});
      if (await targets.count()) {
        await targets.first().click({ force: true }).catch(() => {});
        // Let the capture animate before re-reading the board.
        await page.waitForTimeout(60);
        jumped = true;
        break;
      }
    }
    if (!jumped) break; // no legal move anywhere: the board is finished
  }

  // checkEnd() delays the overlay by 200-500ms so the last capture is visible.
  await overlay.waitFor({ state: "attached", timeout: 3000 }).catch(() => {});
  return (await overlay.count()) > 0;
}

const mockBest = (page, best) =>
  page.route(RPC, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(best),
    }),
  );

test.describe("the end card shows the global best", () => {
  // A full playthrough is a few hundred real clicks, and the first one in a
  // worker also pays page-load cost.
  test.beforeEach(() => test.setTimeout(90_000));

  test("reports the record, and submits its own slug and score", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    const sent = [];
    // 1 marble is a perfect game, so any real result is worse than this.
    await page.route(RPC, async (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "1" });
    });

    await page.goto("/marble-nostalgia/");
    expect(await playToEnd(page), "did not reach an end state").toBe(true);

    const line = page.locator("#globalBest");
    await expect(line).toBeVisible();
    await expect(line).toContainText(/global best 1 marble/i);
    await expect(line).not.toHaveClass(/new-global/);

    // Guards the registry against drifting from the database's game_config.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].p_slug).toBe("marble-nostalgia");
    expect(Number.isInteger(sent[0].p_score)).toBe(true);
    // Not a daily game, so it must not pin a day.
    expect(sent[0].p_day).toBeUndefined();
    expect(uncaught()).toEqual([]);
  });

  test("celebrates when the run matched or beat the record", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    // A huge "best" means whatever the player scores is an improvement.
    await mockBest(page, 999);
    await page.goto("/marble-nostalgia/");
    expect(await playToEnd(page), "did not reach an end state").toBe(true);

    const line = page.locator("#globalBest");
    await expect(line).toBeVisible();
    await expect(line).toContainText(/new global best/i);
    await expect(line).toHaveClass(/new-global/);
    expect(uncaught()).toEqual([]);
  });

  test("says so, and stays playable, when the leaderboard is down", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    await page.route(RPC, (route) => route.abort());
    await page.goto("/marble-nostalgia/");
    expect(await playToEnd(page), "did not reach an end state").toBe(true);

    await expect(page.locator("#globalBest")).toContainText(/unavailable/i);
    // The rest of the end card must be intact — that is the whole point.
    await expect(page.locator("#againBtn")).toBeVisible();
    await expect(page.locator("#shareBtn")).toBeVisible();
    await page.locator("#againBtn").click();
    await expect(page.locator("#overlay")).not.toHaveClass(/show/);
    expect(uncaught()).toEqual([]);
  });
});
