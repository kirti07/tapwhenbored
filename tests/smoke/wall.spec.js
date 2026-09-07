// The arcade at /wall/ — eight cabinets, three boards each.
//
// Two things are worth guarding here above everything else.
//
// The first is the degraded state. This page reads a leaderboard that is
// allowed to be unreachable (ARCHITECTURE.md §26, §27), and every state of the
// panel — loading, empty, error, a full board, and the two games that keep no
// board — shares one grid cell so the page is exactly as tall in all of them.
// If a failed fetch ever changes the page's height, the design is wrong, so the
// height is measured rather than eyeballed.
//
// The second is the keyboard. Both strips claim `role="tablist"`, which tells a
// screen reader the arrow keys work. The prototypes this page came from made
// that claim and implemented nothing, so it is asserted here.

import { test, expect } from "@playwright/test";
import { games, pages } from "../../src/data/games.js";
import { brokenSpriteRefs } from "../helpers/storage.js";

const WALL = pages.find((p) => p.slug === "wall").path;
const BOARD = "**/rest/v1/game_leaders*";
const STANDING = "**/rest/v1/rpc/my_standing*";
const BESTS = "**/rest/v1/game_scores*";

const boarded = games.filter((g) => g.leaderboard !== false);
const scoreless = games.filter((g) => g.leaderboard === false);

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/** Ten rows, the fourth of them this browser's. */
const tenRows = (mine = null) =>
  Array.from({ length: 10 }, (_, i) => ({
    best_score: 100 + i,
    achieved_at: new Date(Date.now() - i * 1000).toISOString(),
    player_id: i === 3 && mine ? mine : `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    players: { name: i === 5 ? null : `Player${i}` },
  }));

/** A board that answers, so the panel reaches its loaded state. */
async function serveBoard(page, { rows = tenRows(), standing = null } = {}) {
  await page.route(BOARD, (route) => json(route, rows));
  await page.route(STANDING, (route) => json(route, standing));
  await page.route(BESTS, (route) => json(route, []));
}

test.describe("the arcade", () => {
  test("has one cabinet tab per game, all eight, without script", async ({ browser }) => {
    // The names are indexable content and must be in the built HTML (§28).
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(WALL);

    await expect(page.locator(".arc-cabtab")).toHaveCount(games.length);
    for (const g of games) {
      await expect(page.locator(`#cab-${g.slug}`)).toContainText(g.title);
    }
    await context.close();
  });

  test("says which cabinets keep no board, and why", async ({ page }) => {
    await serveBoard(page);
    await page.goto(WALL);

    for (const g of scoreless) {
      await expect(page.locator(`#cab-${g.slug}`)).toContainText(/no board/i);
    }
    // And picking one explains itself rather than showing an empty table.
    await page.locator(`#cab-${scoreless[0].slug}`).click();
    await expect(page.locator('[data-state="noboard"]')).toHaveClass(/arc-on/);
    await expect(page.locator("#noboardMsg")).not.toBeEmpty();
    // A game with no board has no periods either.
    await expect(page.locator("#timeTabs")).toBeHidden();
  });

  test("renders a board, marks your row, and names the unnamed", async ({ page }) => {
    await serveBoard(page);
    await page.goto(WALL);

    const rows = page.locator("#boardBody tr");
    await expect(rows).toHaveCount(10);
    // Ranks 1-3 get a medal, the rest a plain number.
    await expect(page.locator(".arc-medal")).toHaveCount(3);
    // A row whose player has not named themselves is a real state.
    await expect(page.locator(".arc-dimname")).toHaveCount(1);
    // The score column is the game's own unit.
    await expect(page.locator("#scoreHead")).toHaveText(boarded[0].scoreUnit);
  });

  test("keeps the page exactly as tall in every state", async ({ page }) => {
    await serveBoard(page);
    await page.goto(WALL);
    await expect(page.locator("#boardBody tr").first()).toBeVisible();
    const loaded = await page.locator("#stateSlot").evaluate((el) => el.getBoundingClientRect().height);

    for (const state of ["loading", "empty", "error", "noboard"]) {
      await page.locator("#stateSlot").evaluate((slot, name) => {
        slot.querySelectorAll(":scope > .arc-st").forEach((s) => {
          const on = s.dataset.state === name;
          s.classList.toggle("arc-on", on);
        });
      }, state);
      const h = await page.locator("#stateSlot").evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${state} must not resize the panel`).toBe(loaded);
    }
  });

  test("says so, and stays usable, when the board is unreachable", async ({ page }) => {
    await page.route(BOARD, (route) => route.abort());
    await page.route(STANDING, (route) => route.abort());
    await page.route(BESTS, (route) => route.abort());
    await page.goto(WALL);

    await expect(page.locator('[data-state="error"]')).toHaveClass(/arc-on/);
    await expect(page.locator("#retry")).toBeVisible();
    // The tabs still work, and the dashes stay dashes.
    await expect(page.locator("#cab-" + boarded[1].slug)).toContainText("—");
    await page.locator("#cab-" + boarded[1].slug).click();
    await expect(page.locator("#cabTitle")).toHaveText(boarded[1].title);
  });

  test("shows an empty board as empty, not as an error", async ({ page }) => {
    await serveBoard(page, { rows: [] });
    await page.goto(WALL);
    await expect(page.locator('[data-state="empty"]')).toHaveClass(/arc-on/);
  });

  test("pins where you stand, including when you are nowhere", async ({ page }) => {
    await serveBoard(page, { standing: { rank: null, total: 10, your_best: null, above: null } });
    await page.goto(WALL);
    await expect(page.locator("#stand")).toHaveClass(/arc-stand--none/);
    await expect(page.locator("#standWho")).toContainText(/not on this board/i);
  });

  test("switches period, and each period asks for its own key", async ({ page }) => {
    const asked = [];
    await page.route(BOARD, (route) => {
      asked.push(new URL(route.request().url()).searchParams.get("period_kind"));
      return json(route, tenRows());
    });
    await page.route(STANDING, (route) => json(route, null));
    await page.route(BESTS, (route) => json(route, []));
    await page.goto(WALL);
    await expect(page.locator("#boardBody tr").first()).toBeVisible();

    await page.locator("#win-week").click();
    await expect(page.locator("#win-week")).toHaveAttribute("aria-selected", "true");
    await page.locator("#win-all").click();
    await expect(page.locator("#win-all")).toHaveAttribute("aria-selected", "true");

    expect(asked).toEqual(["eq.day", "eq.week", "eq.all"]);
  });

  test("both tablists are operable from the keyboard", async ({ page }) => {
    await serveBoard(page);
    await page.goto(WALL);
    await expect(page.locator("#boardBody tr").first()).toBeVisible();

    // Arrow along the cabinets.
    await page.locator(`#cab-${games[0].slug}`).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(`#cab-${games[1].slug}`)).toBeFocused();
    await expect(page.locator(`#cab-${games[1].slug}`)).toHaveAttribute("aria-selected", "true");
    // A roving tabindex: only the selected tab is in the tab order.
    await expect(page.locator(`#cab-${games[0].slug}`)).toHaveAttribute("tabindex", "-1");
    // End jumps to the last, which happens to be a cabinet with no board —
    // so the period strip is correctly gone and there is nothing to arrow.
    await page.keyboard.press("End");
    await expect(page.locator(`#cab-${games[games.length - 1].slug}`)).toBeFocused();
    await expect(page.locator("#timeTabs")).toBeHidden();

    // Back to a cabinet that keeps one, and along the periods.
    await page.locator(`#cab-${boarded[0].slug}`).click();
    await expect(page.locator("#timeTabs")).toBeVisible();
    await page.locator("#win-day").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#win-week")).toBeFocused();
    await expect(page.locator("#win-week")).toHaveAttribute("aria-selected", "true");
  });

  test("the panel is labelled by whichever cabinet is showing", async ({ page }) => {
    await serveBoard(page);
    await page.goto(WALL);
    await expect(page.locator("#cabinet")).toHaveAttribute("aria-labelledby", `cab-${games[0].slug}`);
    await page.locator(`#cab-${games[2].slug}`).click();
    await expect(page.locator("#cabinet")).toHaveAttribute("aria-labelledby", `cab-${games[2].slug}`);
  });

  test("a name is text, never markup", async ({ page }) => {
    await serveBoard(page, {
      rows: [{ best_score: 1, achieved_at: new Date().toISOString(), player_id: "x", players: { name: "<img src=x onerror=alert(1)>" } }],
    });
    await page.goto(WALL);
    const cell = page.locator("#boardBody td.arc-nm").first();
    await expect(cell).toContainText("<img");
    expect(await cell.locator("img").count()).toBe(0);
  });

  test("every sprite reference resolves", async ({ page }) => {
    await serveBoard(page);
    await page.goto(WALL);
    expect(await brokenSpriteRefs(page)).toEqual([]);
  });
});

test.describe("the homepage", () => {
  test("links to the full boards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`a[href="${WALL}"]`).first()).toBeVisible();
  });
});
