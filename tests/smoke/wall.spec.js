// The wall at /wall/ — every game's global best on one page.
//
// The thing most worth guarding here is the degraded state. The page reads a
// leaderboard that is allowed to be unreachable (ARCHITECTURE.md §26, §27), so
// the rows are rendered at their final size with a dash in them and script only
// fills in the number. If a failed fetch ever changes a row's height, the whole
// design of the page is wrong — hence the explicit before/after measurement.
//
// The holder column reads "Unsigned" everywhere and will until identity exists.
// It is asserted rather than skipped so that whoever adds names has to come
// here and change it deliberately.

import { test, expect } from "@playwright/test";
import { games, pages } from "../../src/data/games.js";
import { DAY, brokenSpriteRefs } from "../helpers/storage.js";

const WALL = pages.find((p) => p.slug === "wall").path;
const REST = "**/rest/v1/game_scores*";

const boarded = games.filter((g) => g.leaderboard !== false);

/** One row per boarded game, word-steps filed under today as the server files it. */
const rows = () =>
  boarded.map((g, i) => ({
    game_slug: g.slug,
    best_score: g.scoreFormat === "time" ? 56800 : 40 + i,
    period: g.leaderboard.daily ? DAY() : "all",
    updated_at: new Date(Date.now() - i * 86400000).toISOString(),
  }));

const serve = (page, body) =>
  page.route(REST, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );

test.describe("the wall", () => {
  test("has one row per game with a board, and none for the two without", async ({
    browser,
  }) => {
    // With JavaScript off, because the rows are indexable content and must not
    // depend on the fetch.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(WALL);

    await expect(page.locator(".wrow")).toHaveCount(boarded.length);
    for (const g of boarded) {
      const row = page.locator(`.wrow[data-slug="${g.slug}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(g.title);
      await expect(row.locator(".u")).toHaveText(g.scoreUnit);
    }
    for (const g of games.filter((x) => x.leaderboard === false)) {
      await expect(page.locator(`.wrow[data-slug="${g.slug}"]`)).toHaveCount(0);
    }
    expect(await brokenSpriteRefs(page)).toEqual([]);
    await context.close();
  });

  test("states which way each game scores", async ({ page }) => {
    await page.goto(WALL);
    // The registry has carried lowerIsBetter all along and nothing displayed it.
    await expect(page.locator('.wrow[data-slug="bubble-tap"] .wrule')).toHaveText(
      "higher is better",
    );
    await expect(page.locator('.wrow[data-slug="honeycomb"] .wrule')).toHaveText(
      "fewer is better",
    );
  });

  test("fills each row with its own record, in its own unit", async ({ page }) => {
    await serve(page, rows());
    await page.goto(WALL);

    for (const g of boarded) {
      const row = page.locator(`.wrow[data-slug="${g.slug}"]`);
      await expect(row.locator("[data-score]")).not.toHaveText("—");
      await expect(row.locator("[data-when]")).not.toHaveText("");
    }
    // A duration reads as a time, a count as a number.
    await expect(page.locator('.wrow[data-slug="honeycomb"] [data-score]')).toHaveText("0:56");
  });

  test("takes today's row for the daily game, not an all-time one", async ({ page }) => {
    // word-steps is the only game the server files by date. A stale dated row
    // must not be shown as if it were today's board.
    await serve(page, [
      { game_slug: "word-steps", best_score: 4, period: DAY(), updated_at: new Date().toISOString() },
      { game_slug: "word-steps", best_score: 2, period: DAY(-3), updated_at: new Date().toISOString() },
    ]);
    await page.goto(WALL);
    await expect(page.locator('.wrow[data-slug="word-steps"] [data-score]')).toHaveText("4");
  });

  test("keeps its dashes, and its shape, when the leaderboard is unreachable", async ({
    page,
  }) => {
    await page.route(REST, (route) => route.abort());
    await page.goto(WALL);

    const first = page.locator(".wrow").first();
    const before = await first.boundingBox();
    await page.waitForTimeout(600);
    const after = await first.boundingBox();

    await expect(first.locator("[data-score]")).toHaveText("—");
    expect(after.height, "a failed fetch must not resize a row").toBe(before.height);
    expect(after.y, "nor move one").toBe(before.y);
    await expect(page.locator(".wrow")).toHaveCount(boarded.length);
  });

  test("says Unsigned, because there are no names to show", async ({ page }) => {
    await serve(page, rows());
    await page.goto(WALL);
    const holders = await page
      .locator("[data-holder]")
      .evaluateAll((els) => [...new Set(els.map((e) => e.textContent.trim()))]);
    expect(holders).toEqual(["Unsigned"]);
  });

  test("every row leads to its game", async ({ page }) => {
    await page.goto(WALL);
    for (const g of boarded) {
      await expect(page.locator(`.wrow[data-slug="${g.slug}"] a`)).toHaveAttribute(
        "href",
        g.path,
      );
    }
  });
});

test.describe("the homepage", () => {
  test("links to the full boards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('#wallSec .sec-link')).toHaveAttribute("href", WALL);
  });
});
