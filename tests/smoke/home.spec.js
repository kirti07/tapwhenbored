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

    // The prose beside it is indexable too.
    await expect(page.locator(".intro")).toBeVisible();
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

test.describe("a cabinet's meta line", () => {
  test("shows your best at that game, from storage alone", async ({ browser }) => {
    // The best is local and always has been. What changed is that the line has
    // three states rather than a badge that appears: a best, "not played yet",
    // and "no board, on purpose" for the two games that keep no score.
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem("twb:untangle.best", "31");
      localStorage.setItem("twb:honeycomb.best", "56800");
    });
    const page = await context.newPage();
    await page.goto(home.path);

    await expect(page.locator('[data-best="honeycomb"]')).toHaveText("0:56 time");
    // Untangle keeps no board, so its line says so and script must not
    // overwrite it with a number.
    await expect(page.locator('[data-best="untangle"]')).toHaveText("no board, on purpose");
    // A game with a board and no local best says what is true.
    await expect(page.locator('[data-best="slide-n-order"]')).toHaveText("not played yet");
    await context.close();
  });

  test("says so, rather than nothing, before anything is played", async ({ page }) => {
    await page.goto(home.path);
    for (const g of games.filter((x) => x.leaderboard !== false)) {
      await expect(page.locator(`[data-best="${g.slug}"]`)).toHaveText("not played yet");
    }
  });

  test("never truncates, at any width", async ({ page }) => {
    /* A cut-off "no board, on purpo…" explains nothing, and it went unnoticed
       once because `scrollWidth` rounds: the line needed 121px in a 120px box
       and reported neither. So measure the text unclipped instead, and check
       the two breakpoints where the cards are narrowest — just above the
       four-column switch, and the smallest phone. */
    for (const width of [1180, 1280, 620, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(home.path);
      await page.evaluate(() => document.fonts.ready);

      const cut = await page.evaluate(() =>
        [...document.querySelectorAll(".card-m, .card-t")]
          .filter((el) => {
            if (getComputedStyle(el).whiteSpace !== "nowrap") return false;
            const box = el.clientWidth;
            const o = el.style.cssText;
            el.style.position = "absolute";
            el.style.width = "auto";
            el.style.overflow = "visible";
            const real = Math.ceil(el.getBoundingClientRect().width);
            el.style.cssText = o;
            return real > box;
          })
          .map((el) => el.textContent.trim()),
      );
      expect(cut, `truncated at ${width}px`).toEqual([]);
    }
  });

  test("survives storage being blocked", async ({ page }) => {
    await blockStorage(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(home.path);
    await expect(page.locator(".shelf > a")).toHaveCount(games.length);
    expect(errors).toEqual([]);
  });
});

test.describe("the wall", () => {
  test("shows one tile per game that has a board", async ({ page }) => {
    await page.goto(home.path);
    await expect(page.locator(".roll-row")).toHaveCount(boarded.length);
    // The two games with no board are absent rather than shown empty.
    for (const g of games.filter((x) => x.leaderboard === false)) {
      await expect(page.locator(`.roll-row[data-slug="${g.slug}"]`)).toHaveCount(0);
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
      const tile = page.locator(`.roll-row[data-slug="${g.slug}"]`);
      await expect(tile.locator("[data-score]")).not.toHaveText("—");
      await expect(tile.locator(".roll-u")).toHaveText(g.scoreUnit);
    }
  });

  test("keeps a dash, and its shape, when the leaderboard is unreachable", async ({
    page,
  }) => {
    await page.route(REST, (route) => route.abort());
    await page.goto(home.path);

    const before = await page.locator(".roll-row").first().boundingBox();
    await page.waitForTimeout(600);
    const after = await page.locator(".roll-row").first().boundingBox();

    await expect(page.locator(".roll-row").first().locator("[data-score]")).toHaveText("—");
    expect(after.height, "a failed fetch must not resize a row").toBe(before.height);
    await expect(page.locator("#wall")).toBeVisible();
  });

  test("names the record holder, and is exactly as tall either way", async ({ page }) => {
    // The signature line held its height reading "Unsigned" from the day this
    // page was built, so that when names arrived nothing would move. They have
    // arrived, so both halves of that promise are asserted here.
    const day = today();
    const withName = games.find((g) => g.leaderboard !== false);

    await page.route(REST, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            game_slug: withName.slug,
            best_score: 42,
            period: withName.leaderboard.daily ? day : "all",
            updated_at: new Date().toISOString(),
            players: { name: "Nanna June" },
          },
        ]),
      }),
    );

    await page.goto(home.path);
    const tile = page.locator(`.roll-row[data-slug="${withName.slug}"]`);
    const sig = tile.locator(".roll-who");

    const before = await sig.evaluate((el) => el.getBoundingClientRect().height);
    await expect(sig).toHaveText("Nanna June");
    const after = await sig.evaluate((el) => el.getBoundingClientRect().height);
    expect(after, "a name arriving must not change the line's height").toBe(before);

    // A holder who never named themselves still reads Unsigned, which is true.
    const other = games.find((g) => g.leaderboard !== false && g.slug !== withName.slug);
    await expect(page.locator(`.roll-row[data-slug="${other.slug}"] .roll-who`)).toHaveText("Unsigned");
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
