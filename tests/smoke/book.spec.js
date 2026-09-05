// The sticker book at /book/.
//
// The rule the whole feature rests on is the daily one: a sticker is earned by
// finishing a game *today*, and the book empties at midnight. Most of what is
// worth testing here is the empty and stale cases, because those are the ones
// that ship wrong — a book that quietly keeps yesterday's stickers looks fine
// and is a lie.
//
// The last test in this file is the only one in the suite that proves the
// recording call in a game is actually wired up. Everything else could pass
// with eight games that never write anything.

import { test, expect } from "@playwright/test";
import { games, pages } from "../../src/data/games.js";
import { DAY, playedOn, withStorage, blockStorage, brokenSpriteRefs } from "../helpers/storage.js";

const BOOK = pages.find((p) => p.slug === "book").path;

test.describe("the book", () => {
  test("renders eight slots with JavaScript off, and every sticker resolves", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(BOOK);

    await expect(page.locator(".book-grid .slot")).toHaveCount(games.length);
    for (const g of games) {
      await expect(page.locator(`[data-slot="${g.slug}"]`)).toHaveCount(1);
    }
    // A <use> pointing at a symbol that is not in this page's sprite renders an
    // empty box and says nothing.
    const broken = await brokenSpriteRefs(page);
    expect(broken).toEqual([]);
    await context.close();
  });

  test("claims nothing on a device that has not played today", async ({ page }) => {
    await page.goto(BOOK);
    await expect(page.locator(".slot--f")).toHaveCount(0);
    await expect(page.locator(".book-grid .slot--e")).toHaveCount(games.length);
    await expect(page.locator("#bookH")).toHaveText("Nothing played yet today");
  });

  test("fills exactly the games finished today, with their own scores", async ({
    browser,
  }) => {
    const context = await withStorage(browser, [
      playedOn("untangle", 31, DAY()),
      playedOn("honeycomb", 56800, DAY()),
    ]);
    const page = await context.newPage();
    await page.goto(BOOK);

    await expect(page.locator(".slot--f")).toHaveCount(2);
    await expect(page.locator("#bookH")).toHaveText(`2 of ${games.length} played today`);

    // A count carries its unit; a duration reads as a time and does not.
    const untangle = page.locator('[data-slot="untangle"]');
    await expect(untangle.locator("[data-score]")).toHaveText("31");
    await expect(untangle.locator("[data-unit]")).toHaveText("moves");
    await expect(page.locator('[data-slot="honeycomb"] [data-score]')).toHaveText("0:56");

    // An earned slot stops offering to be played.
    await expect(untangle.locator(".btn")).toBeHidden();
    await expect(page.locator('[data-slot="flip-it"] .btn')).toBeVisible();
    await context.close();
  });

  test("a game with no score still earns its sticker", async ({ browser }) => {
    // doodle-on finishes with a drawing, not a number. The slot fills; the
    // number and unit stay away rather than showing a zero.
    const context = await withStorage(browser, [playedOn("doodle-on", null, DAY())]);
    const page = await context.newPage();
    await page.goto(BOOK);

    const slot = page.locator('[data-slot="doodle-on"]');
    await expect(slot).toHaveClass(/slot--f/);
    await expect(slot.locator("[data-score]")).toBeHidden();
    await expect(slot.locator("[data-unit]")).toBeHidden();
    await expect(slot.locator("[data-lab]")).toHaveText("Played today");
    await context.close();
  });

  test("yesterday's play does not count", async ({ browser }) => {
    const context = await withStorage(browser, [playedOn("untangle", 31, DAY(-1))]);
    const page = await context.newPage();
    await page.goto(BOOK);

    await expect(page.locator(".slot--f")).toHaveCount(0);
    await expect(page.locator("#bookH")).toHaveText("Nothing played yet today");
    await context.close();
  });

  test("survives storage being blocked", async ({ browser }) => {
    const context = await browser.newContext();
    await blockStorage(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BOOK);
    await expect(page.locator(".book-grid .slot")).toHaveCount(games.length);
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe("the name", () => {
  test("reads Unsigned until one is set", async ({ page }) => {
    await page.goto(BOOK);
    await expect(page.locator("#nameOut")).toHaveText("Unsigned");
    await expect(page.locator("#avatar")).toHaveText("?");
    await expect(page.locator("#nameEdit")).toBeHidden();
  });

  test("saving one updates the card, the stickers, and survives a reload", async ({
    browser,
  }) => {
    const context = await withStorage(browser, [playedOn("untangle", 31, DAY())]);
    const page = await context.newPage();
    await page.goto(BOOK);

    await expect(page.locator('[data-slot="untangle"] [data-sig]')).toHaveText("Unsigned");

    await page.locator("#editBtn").click();
    await expect(page.locator("#nameEdit")).toBeVisible();
    await page.locator("#nameInp").fill("Kiri");
    await page.locator("#saveBtn").click();

    await expect(page.locator("#nameEdit")).toBeHidden();
    await expect(page.locator("#nameOut")).toHaveText("Kiri");
    await expect(page.locator("#avatar")).toHaveText("K");
    await expect(page.locator('[data-slot="untangle"] [data-sig]')).toHaveText("Kiri");

    await page.reload();
    await expect(page.locator("#nameOut")).toHaveText("Kiri");
    await context.close();
  });

  test("cleans what it stores, and shows what it stored", async ({ page }) => {
    await page.goto(BOOK);
    await page.locator("#editBtn").click();
    // Padded, internally spaced, and far too long.
    await page.locator("#nameInp").fill("   a   very   long   name   indeed   ");
    await page.locator("#saveBtn").click();

    const shown = await page.locator("#nameOut").textContent();
    expect(shown.length).toBeLessThanOrEqual(16);
    expect(shown).toBe(shown.trim());
    expect(shown).not.toMatch(/\s{2}/);
  });

  test("renders a name containing markup as text", async ({ page }) => {
    await page.goto(BOOK);
    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("<b>hi</b>");
    await page.locator("#saveBtn").click();

    // Text, not parsed. The research found every prototype stored this verbatim.
    await expect(page.locator("#nameOut")).toHaveText("<b>hi</b>");
    expect(await page.locator("#nameOut b").count()).toBe(0);
  });

  test("Escape leaves the edit without saving", async ({ page }) => {
    await page.goto(BOOK);
    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("Temporary");
    await page.locator("#nameInp").press("Escape");

    await expect(page.locator("#nameEdit")).toBeHidden();
    await expect(page.locator("#editBtn")).toBeFocused();
    await page.reload();
    await expect(page.locator("#nameOut")).toHaveText("Unsigned");
  });
});

test.describe("end to end", () => {
  test("finishing a game fills its slot in the book", async ({ page }) => {
    // The only test that proves a game's recordPlay() call is wired up at all.
    // doodle-on because its round ends on a clock rather than a solve.
    await page.clock.install();
    await page.goto("/doodle-on/");
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(300);

    const box = await page.locator("#canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
    await page.mouse.up();

    await page.clock.fastForward("00:35");
    await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });

    await page.goto(BOOK);
    await expect(page.locator('[data-slot="doodle-on"]')).toHaveClass(/slot--f/);
    await expect(page.locator("#bookH")).toHaveText(`1 of ${games.length} played today`);
  });
});
