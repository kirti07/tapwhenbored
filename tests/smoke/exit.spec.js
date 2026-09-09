// You can always leave a game page.
//
// There are two ways off it now, and this file holds both. The "Games" link in
// the top bar was the only one, and an open end card used to take it away:
// bindOverlay() marked the whole `.stage` inert, and seven of the eight games
// keep their top bar inside `.stage`. The link stayed painted at full opacity —
// the card's backdrop is a gradient that reaches transparency well above it —
// and did nothing at all.
//
// word-steps turned that from a moment into a state. It re-opens its card on
// load whenever today's puzzle is already solved, so for the rest of the day
// every visit, including a shared link, landed on a page whose only exit was
// dead. On a phone there is no Escape key, and back then no game's card had a
// close button, so the only way out was to reload the tab.
//
// The card carries its own X to the games list now. That is a second exit, not
// a replacement: the top bar must still work behind an open card, because the
// how-to sheet has no X and never will. Both are asserted below, per game.
//
// These drive the exits the way a player does: open the thing, tap the control,
// and check the browser actually went home.

import { test, expect } from "@playwright/test";
import { games } from "../../src/data/games.js";
import { LAUNCH_DATE, PUZZLES } from "../../src/word-steps/data.js";
import { openEndCard } from "../helpers/endcard.js";

/* bubble-tap has no `.stage` and shows its cards by removing `.hidden`; it is
   covered separately below. */
const staged = games.filter((g) => g.slug !== "bubble-tap");

/** Is this element out of reach? `inert` is inherited, so an ancestor counts. */
function unreachable(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Boolean(el.closest("[inert]")) : null;
  }, selector);
}

/** Tap the back link and say whether the browser actually left. */
async function leavesViaGames(page) {
  try {
    await page.locator(".back-link").click({ timeout: 2500 });
    await page.waitForURL((url) => url.pathname === "/", { timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

test.describe("the way out survives an open end card", () => {
  for (const game of staged) {
    test(`${game.path} — the card is up and Games still works`, async ({ page }) => {
      await page.goto(game.path);

      /* Shown by adding the class the game itself adds; bindOverlay watches
         that class rather than exposing an API, so this is the same trigger
         the game uses and not a test-only path. Reaching a genuine end card
         would mean playing eight different games to completion for one
         assertion about shared shell code. */
      await page.evaluate(() => document.getElementById("overlay").classList.add("show"));
      await expect(page.locator("#overlay")).toHaveClass(/show/);

      // The board is properly out of reach — that part was always right.
      expect(
        await unreachable(page, ".play-area, .board-area, .canvas-area"),
        "the board behind the card is inert",
      ).toBe(true);
      // And the exit is not.
      expect(await unreachable(page, ".back-link"), "the Games link is reachable").toBe(false);
      expect(await leavesViaGames(page), "tapping Games goes home").toBe(true);
    });
  }

  test("/bubble-tap/ — game over and paused both leave the top bar alone", async ({ page }) => {
    await page.goto("/bubble-tap/");

    for (const id of ["gameOverOverlay", "pauseOverlay"]) {
      await page.goto("/bubble-tap/");
      // bubble-tap shows a card by *removing* .hidden.
      await page.evaluate((overlayId) => {
        document.getElementById(overlayId).classList.remove("hidden");
      }, id);

      expect(await unreachable(page, "#playfield"), `${id}: playfield inert`).toBe(true);
      expect(await unreachable(page, ".back-link"), `${id}: Games reachable`).toBe(false);
      expect(await leavesViaGames(page), `${id}: tapping Games goes home`).toBe(true);
    }
  });
});

test.describe("the end card's own exit", () => {
  for (const game of games) {
    test(`${game.path} — the X on the card goes home`, async ({ page }) => {
      await page.goto(game.path);
      const card = await openEndCard(page, game.slug);
      const exit = card.locator(".overlay-exit");

      await expect(exit).toBeVisible();
      // Not just painted: the thing under that point has to be the exit
      // itself. bubble-tap's top bar sits *above* its card in the stacking
      // order, so a bounding box alone would prove nothing here.
      await exit.click({ timeout: 2500 });
      await page.waitForURL((url) => url.pathname === "/", { timeout: 2500 });
    });
  }
});

test.describe("the way out survives an open how-to sheet", () => {
  for (const game of games) {
    test(`${game.path} — sheet open, one tap dismisses and Games works`, async ({ page }) => {
      await page.goto(game.path);
      await page.locator("#howtoBtn").click();
      await expect(page.locator("#howtoSheet")).toHaveClass(/show/);

      // Not switched off for anyone — a keyboard or a screen reader can still
      // get to it, which is the part that was broken.
      expect(await unreachable(page, ".back-link"), "the Games link is reachable").toBe(false);

      /* A pointer is a different matter, and deliberately so: the sheet's
         scrim covers the whole viewport, so a tap over the top bar lands on
         the scrim — which is what a tap outside a bottom sheet is *for*.
         Asserting it by coordinate rather than by clicking the link, because
         the link genuinely is not clickable here and Playwright is right to
         refuse. One extra tap, the same in all eight games. */
      const hit = await page.evaluate(() => {
        const r = document.querySelector(".back-link").getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el ? el.id || el.className : null;
      });
      expect(hit, "a tap over the bar lands on the scrim").toMatch(/howtoBackdrop|howto-backdrop/);

      await page.locator("#howtoBackdrop").click();
      await expect(page.locator("#howtoSheet")).not.toHaveClass(/show/);
      expect(await leavesViaGames(page), "and then Games goes home").toBe(true);
    });
  }
});

test.describe("word-steps, the reported case", () => {
  /* The same puzzle the page will choose, derived the way the game derives it
     (game.js getDayIndex) so the persisted state is accepted rather than
     discarded as a different day's. */
  const dayIndex = (() => {
    const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round(
      (midnight(new Date()) - midnight(new Date(`${LAUNCH_DATE}T00:00:00`))) / 86400000,
    );
    return ((days % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  })();

  test("a solved puzzle re-opens its card on load, and Games still works", async ({ page }) => {
    await page.goto("/word-steps/");
    await page.evaluate(
      ({ day, puzzle }) => {
        localStorage.setItem(
          "twb:word-steps.state",
          JSON.stringify({
            day,
            history: [puzzle.s, puzzle.t],
            solved: true,
            bestSteps: 1,
            solvedSteps: 1,
          }),
        );
      },
      { day: dayIndex, puzzle: PUZZLES[dayIndex] },
    );
    await page.reload();

    // This is the state a shared link lands in for anyone who has played today.
    await expect(page.locator("#overlay")).toHaveClass(/show/);
    expect(await unreachable(page, ".back-link"), "the Games link is reachable").toBe(false);
    expect(await leavesViaGames(page), "tapping Games goes home").toBe(true);
  });

  test("the card still holds focus and Escape still dismisses it", async ({ page }) => {
    // The exit being live must not have cost the card its dialog behaviour.
    await page.goto("/word-steps/");
    await page.evaluate(() => document.getElementById("overlay").classList.add("show"));

    await expect(page.locator("#againBtn")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#overlay")).not.toHaveClass(/show/);
    expect(await unreachable(page, ".play-area"), "the board comes back").toBe(false);
  });
});
