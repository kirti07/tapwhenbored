// The homepage, after the v2-sticker redesign.
//
// Three things are worth guarding here and nothing else was covering them.
//
// The shelf is indexable content and must be in the built HTML, not assembled
// by home.js — ARCHITECTURE.md §28. So the page is tested with JavaScript off
// as well as on.
//
// "Your bests" and the wall both render numbers the page might not have. The
// rule for both is that an absent number is a dash or an empty slot, never a
// zero and never a claim. These specs are mostly about the empty and broken
// states, because those are the ones that ship wrong.
//
// And neither may resize after it resolves. The strip sits directly above the
// shelf and the wall tiles sit in a grid, so a late number that changes a
// height moves something the reader is already looking at.

import { test, expect } from "@playwright/test";
import { games, home } from "../../src/data/games.js";
import { DAY, playedOn, withStorage, blockStorage, brokenSpriteRefs } from "../helpers/storage.js";

const boarded = games.filter((g) => g.leaderboard !== false);
const REST = "**/rest/v1/game_scores*";

/** The wall payload, with a row for every game that has a board. */
const rows = (day) =>
  boarded.map((g, i) => ({
    game_slug: g.slug,
    best_score: g.scoreFormat === "time" ? 38200 + i * 1000 : 40 + i,
    period: g.leaderboard.daily ? day : "all",
    updated_at: `2026-09-0${(i % 8) + 1}T10:00:00Z`,
  }));

const today = () => DAY();

test.describe("the shelf", () => {
  test("is in the HTML, not built by script", async ({ browser }) => {
    // The one contract that matters for search: a crawler that runs no
    // JavaScript still sees every game and every link.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(home.path);

    for (const g of games) {
      const card = page.locator(`a[href="${g.path}"]`);
      await expect(card, `card for ${g.slug}`).toHaveCount(1);
      await expect(card).toContainText(g.title);
    }
    await expect(page.locator(".shelf > a")).toHaveCount(games.length);

    // The prose either side of it is indexable too.
    await expect(page.locator(".intro")).toBeVisible();
    await expect(page.locator(".faq-item")).toHaveCount(3);
    await context.close();
  });

  test("carries each game's accent from the registry", async ({ page }) => {
    await page.goto(home.path);
    for (const g of games) {
      const style = await page
        .locator(`a[href="${g.path}"]`)
        .getAttribute("style");
      expect(style, `${g.slug} accent`).toContain(g.accent);
      expect(style, `${g.slug} dark accent`).toContain(g.accentDark);
    }
  });

  test("draws a sticker for every game, and no broken references", async ({ page }) => {
    await page.goto(home.path);
    const missing = await brokenSpriteRefs(page);
    expect(missing, "every <use> resolves to a symbol in the sprite").toEqual([]);
  });
});

test.describe("today's stickers", () => {
  test("claims nothing before anything is played today", async ({ page }) => {
    await page.goto(home.path);
    await expect(page.locator(".slot.is-earned")).toHaveCount(0);
    await expect(page.locator("#bookProgress")).toHaveAttribute(
      "aria-label",
      "Nothing played today",
    );
    await expect(page.locator("#bookH")).toHaveText("Play a game to start today's book");
  });

  test("lights exactly the games finished today", async ({ browser }) => {
    const context = await withStorage(browser, [
      playedOn("untangle", 31),
      playedOn("honeycomb", 56800),
    ]);
    const page = await context.newPage();
    await page.goto(home.path);

    await expect(page.locator(".slot.is-earned")).toHaveCount(2);
    await expect(page.locator('[data-slot="untangle"]')).toHaveClass(/is-earned/);
    await expect(page.locator('[data-slot="honeycomb"]')).toHaveClass(/is-earned/);
    await expect(page.locator('[data-slot="doodle-on"]')).not.toHaveClass(/is-earned/);
    await expect(page.locator("#bookH")).toHaveText(`2 of ${games.length} played today`);
    await context.close();
  });

  test("yesterday's play does not count — the book empties at midnight", async ({
    browser,
  }) => {
    // The rule the whole feature rests on. A record is not deleted at midnight;
    // it simply stops being today's, which is why nothing has to sweep.
    const context = await withStorage(browser, [playedOn("untangle", 31, DAY(-1))]);
    const page = await context.newPage();
    await page.goto(home.path);

    await expect(page.locator(".slot.is-earned")).toHaveCount(0);
    await expect(page.locator("#bookH")).toHaveText("Play a game to start today's book");
    await context.close();
  });

  test("an all-time best still shows on the card, whatever today holds", async ({
    browser,
  }) => {
    // Two different claims that must not be confused: "Best" is your record
    // ever, the strip is what you did today. Both true at once.
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem("twb:untangle.best", "31");
      localStorage.setItem("twb:honeycomb.best", "56800");
    });
    const page = await context.newPage();
    await page.goto(home.path);

    await expect(page.locator('[data-best="honeycomb"]')).toHaveText("Best 0:56");
    await expect(page.locator('[data-best="untangle"]')).toHaveText("Best 31 moves");
    // ...and nothing was played today.
    await expect(page.locator(".slot.is-earned")).toHaveCount(0);
    await context.close();
  });

  test("links to the book", async ({ page }) => {
    await page.goto(home.path);
    await expect(page.locator(".book-cta a")).toHaveAttribute("href", "/book/");
  });

  test("survives storage being blocked", async ({ browser }) => {
    const context = await browser.newContext();
    await blockStorage(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(home.path);
    await expect(page.locator(".shelf > a")).toHaveCount(games.length);
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe("the wall", () => {
  test("shows one tile per game that has a board", async ({ page }) => {
    await page.goto(home.path);
    await expect(page.locator(".stk")).toHaveCount(boarded.length);
    // The two games with no board are absent rather than shown empty.
    for (const g of games.filter((x) => x.leaderboard === false)) {
      await expect(page.locator(`.stk[data-slug="${g.slug}"]`)).toHaveCount(0);
    }
  });

  test("fills each tile with its own global best, in its own unit", async ({ page }) => {
    const day = today();
    await page.route(REST, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows(day)),
      }),
    );
    await page.goto(home.path);

    for (const g of boarded) {
      const tile = page.locator(`.stk[data-slug="${g.slug}"]`);
      await expect(tile.locator("[data-score]")).not.toHaveText("—");
      await expect(tile.locator(".u")).toHaveText(g.scoreUnit);
    }
  });

  test("keeps a dash, and its shape, when the leaderboard is unreachable", async ({
    page,
  }) => {
    await page.route(REST, (route) => route.abort());
    await page.goto(home.path);

    const before = await page.locator(".stk").first().boundingBox();
    await page.waitForTimeout(600);
    const after = await page.locator(".stk").first().boundingBox();

    await expect(page.locator(".stk").first().locator("[data-score]")).toHaveText("—");
    expect(after.height, "a failed fetch must not resize a tile").toBe(before.height);
    await expect(page.locator("#wallSec")).toBeVisible();
  });

  test("reserves the signature line before there are any names", async ({ page }) => {
    // Names are not built yet and will be optional when they are. The line has
    // to hold its height now so adding one later moves nothing.
    await page.goto(home.path);
    const h = await page.locator(".stk .sig").first().evaluate((el) => {
      const before = el.getBoundingClientRect().height;
      el.textContent = "Quiet Otter 42";
      return { before, after: el.getBoundingClientRect().height };
    });
    expect(h.after).toBe(h.before);
  });

  test("sorts, and says which sort is on", async ({ page }) => {
    const day = today();
    await page.route(REST, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows(day)),
      }),
    );
    await page.goto(home.path);

    const best = page.locator('.seg button[data-sort="best"]');
    const recent = page.locator('.seg button[data-sort="new"]');
    await expect(best).toHaveAttribute("aria-pressed", "true");
    await expect(recent).toHaveAttribute("aria-pressed", "false");

    const order = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".stk")].map((el) => ({
          slug: el.dataset.slug,
          order: el.style.order,
        })),
      );

    await recent.click();
    await expect(recent).toHaveAttribute("aria-pressed", "true");
    await expect(best).toHaveAttribute("aria-pressed", "false");
    const newest = await order();

    await best.click();
    const bestOrder = await order();

    expect(newest.map((t) => t.order)).not.toEqual(bestOrder.map((t) => t.order));
    // Sorting is presentational: no tile is removed or duplicated.
    expect(newest.map((t) => t.slug).sort()).toEqual(bestOrder.map((t) => t.slug).sort());
  });
});

test.describe("theme", () => {
  test("toggles, persists, and honours a shared ?theme= link", async ({ page }) => {
    await page.goto(home.path);
    const btn = page.locator("#themeBtn");
    const theme = () =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    const before = await theme();
    await btn.click();
    const after = await theme();
    expect(after).not.toBe(before);

    await page.reload();
    expect(await theme()).toBe(after);

    await page.goto("/?theme=dark");
    expect(await theme()).toBe("dark");
    await page.goto("/?theme=light");
    expect(await theme()).toBe("light");
  });
});
