// Honeycomb: the hive puzzle.
//
// The hive is randomly generated on every load, so these tests assert
// invariants rather than a particular layout (GAME-TESTING.md §7). "40 tiles
// with 15 bombs" is true of one hive, not of the game; "a hive always has
// tiles, a positive bomb count, and a clock that starts on the first move" is
// true of every hive.

import { test, expect } from "@playwright/test";

const tiles = (page) => page.locator("#board .tile");
const tappable = (page) => page.locator("#board .tile--tappable");

test.beforeEach(async ({ page }) => {
  await page.goto("/honeycomb/");
});

test("a fresh hive is generated and playable", async ({ page }) => {
  await expect(tiles(page).first()).toBeVisible();
  expect(await tiles(page).count()).toBeGreaterThan(0);

  // Clearing every bomb is the win condition, so there must be at least one.
  const bombs = Number(await page.locator("#bombsVal").innerText());
  expect(Number.isInteger(bombs)).toBe(true);
  expect(bombs).toBeGreaterThan(0);

  // Only edge tiles can be moved, and a solvable hive always offers a move.
  expect(await tappable(page).count()).toBeGreaterThan(0);

  await expect(page.locator("#timeVal")).toHaveText("0:00");
});

test("the clock runs from the moment the hive appears", async ({ page }) => {
  // runStartTime is set when the hive is built, so the timer is live before the
  // first move. Asserting the real behaviour rather than the one I assumed.
  await expect(page.locator("#timeVal")).toHaveText("0:00");
  await expect(page.locator("#timeVal")).not.toHaveText("0:00", { timeout: 4000 });
});

test("tapping an edge tile either clears a bomb or is a safe move", async ({ page }) => {
  // Observed rule: a tap resolves one of two ways. Clearing a bomb removes that
  // tile, so tiles and bombs both fall by one; a safe move leaves both counts
  // alone. Nothing else is legal, and neither count may ever rise.
  const state = async () => ({
    tiles: await tiles(page).count(),
    bombs: Number(await page.locator("#bombsVal").innerText()),
  });

  const before = await state();
  await tappable(page).first().click();
  await page.waitForTimeout(500);
  const after = await state();

  expect(after.tiles).toBeLessThanOrEqual(before.tiles);
  expect(after.bombs).toBeLessThanOrEqual(before.bombs);
  expect(before.tiles - after.tiles).toBe(before.bombs - after.bombs);
  expect(before.tiles - after.tiles).toBeLessThanOrEqual(1);

  // While the run is live the hive must still offer a move.
  const finished = await page.locator("#overlay").evaluate((el) =>
    el.className.includes("show"),
  );
  if (!finished) {
    expect(after.tiles).toBeGreaterThan(0);
    expect(await tappable(page).count()).toBeGreaterThan(0);
  }
});

test("New hive produces a fresh board and resets the clock", async ({ page }) => {
  const seconds = async () => {
    const [m, s] = (await page.locator("#timeVal").innerText()).split(":");
    return Number(m) * 60 + Number(s);
  };
  // Let the clock get far enough ahead that a reset is unambiguous.
  await expect(page.locator("#timeVal")).not.toHaveText("0:00", { timeout: 4000 });
  await page.waitForTimeout(1200);
  const before = await seconds();
  expect(before).toBeGreaterThan(0);

  await page.locator("#newBtn").click();
  await page.waitForTimeout(300);

  // Compared rather than pinned to "0:00": the clock ticks every 250ms, so it
  // may legitimately already read 0:01 by the time this runs.
  expect(await seconds()).toBeLessThan(before);
  expect(await tiles(page).count()).toBeGreaterThan(0);
  expect(Number(await page.locator("#bombsVal").innerText())).toBeGreaterThan(0);
  // A restart must not require a page reload.
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
});

test("rapid tapping does not break the hive", async ({ page }) => {
  // Tile moves are animated, and MOVE_MS is tuned to the CSS transition; tapping
  // faster than the animation must not desynchronise the board.
  for (let i = 0; i < 8; i++) {
    const t = tappable(page).first();
    if (!(await t.count()) || (await page.locator("#overlay").isVisible())) break;
    await t.click({ force: true });
  }
  await page.waitForTimeout(600);

  expect(await tiles(page).count()).toBeGreaterThan(0);
  const bombs = Number(await page.locator("#bombsVal").innerText());
  expect(bombs).toBeGreaterThanOrEqual(0);
});

test("the how-to sheet opens and closes", async ({ page }) => {
  // The sheet animates out with opacity rather than display, so it stays
  // "visible" to Playwright after closing. The `show` class is the real state.
  await page.locator("#howtoBtn").click();
  await expect(page.locator("#howtoSheet")).toHaveClass(/show/);
  await page.locator("#howtoBackdrop").click();
  await expect(page.locator("#howtoSheet")).not.toHaveClass(/show/);
});
