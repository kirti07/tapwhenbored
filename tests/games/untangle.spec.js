// Untangle: drag the free dots until no lines cross.
//
// Every puzzle is built as a ring of dots on a circle with chords that don't
// cross, then the free dots are shuffled among the free slots. Putting dot i
// back on slot i is therefore always a solution; the test does exactly that,
// with the mouse, the way a player would.

import { test, expect } from "@playwright/test";

// The game's canonical layout: slot i sits at angle i/n of a turn, starting at
// 12 o'clock, HOME_RADIUS from the centre of the board.
const HOME_RADIUS = 0.36;

async function solve(page) {
  const { rect, dots } = await page.evaluate(() => {
    const r = document.getElementById("board").getBoundingClientRect();
    const hits = [...document.querySelectorAll("#board .node-hit")];
    const nodes = [...document.querySelectorAll("#board .node")];
    return {
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      dots: hits.map((h, i) => {
        const b = h.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, fixed: nodes[i].classList.contains("fixed") };
      }),
    };
  });
  const n = dots.length;
  for (let i = 0; i < n; i++) {
    if (dots[i].fixed) continue;
    if (await page.locator("#overlay.show").count()) return;
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const to = {
      x: rect.left + (0.5 + HOME_RADIUS * Math.cos(a)) * rect.width,
      y: rect.top + (0.5 + HOME_RADIUS * Math.sin(a)) * rect.height,
    };
    // Where the dot is now, not where it started: an earlier drag may have
    // left another dot on top of it, so grab it by its own hit circle.
    const box = await page.locator("#board .node-hit").nth(i).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/untangle/");
  await expect(page.locator("#board .node").first()).toBeVisible();
});

test("putting every dot back on the circle solves it and shows the end card", async ({ page }) => {
  await solve(page);
  await expect(page.locator("#overlay")).toHaveClass(/show/);
  await expect(page.locator("#overlaySub")).toHaveText(/^\d+ moves? · \d+s$/);
});

test("Share reports the same time as the end card, however long after", async ({ page }) => {
  await page.evaluate(() => {
    window.__shared = null;
    navigator.share = (data) => { window.__shared = data; return Promise.resolve(); };
  });
  await solve(page);
  await expect(page.locator("#overlay")).toHaveClass(/show/);
  const card = await page.locator("#overlaySub").innerText();
  const [, moves, secs] = card.match(/^(\d+) moves? · (\d+)s$/);

  await page.waitForTimeout(2500);
  await page.click("#shareBtn");
  const shared = await page.evaluate(() => window.__shared.text);
  expect(shared).toContain(`in ${moves} move`);
  expect(shared).toContain(`(${secs}s)`);
});
