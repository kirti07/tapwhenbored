// Marble Nostalgia: peg solitaire on the English cross.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/marble-nostalgia/");
});

test("selecting a marble lights its jumps; restart clears them on the new board", async ({ page }) => {
  // On the opening board the marble two above the empty centre can jump into
  // it, and nothing else. It bounces as a hint to new players, so it never
  // holds still long enough for a normal click.
  await page.locator('#marblesGrid .marble[data-r="1"][data-c="3"]').click({ force: true });
  await expect(page.locator("#marblesGrid .marble.selected")).toHaveCount(1);
  await expect(page.locator("#holesGrid .hole.valid-target")).toHaveCount(1);

  await page.click("#restartBtn");
  await expect(page.locator("#holesGrid .hole.valid-target")).toHaveCount(0);
  await expect(page.locator("#marblesGrid .marble.selected")).toHaveCount(0);
  await expect(page.locator("#count")).toHaveText("32");
});
