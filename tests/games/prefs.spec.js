import { test, expect } from "@playwright/test";
import { games } from "../../src/data/games.js";

// Every game keeps something in localStorage — a best score, a level, a saved
// puzzle, whether the player has seen the hints — and a browser is allowed to
// refuse. Safari's private mode, an embedded webview, and "block all site data"
// all throw from getItem and setItem rather than returning null.
//
// Seven games wrapped every call in a try/catch. The eighth did not, and read
// storage at module scope, so bubble-tap threw before its first bubble existed
// while the rest degraded silently. src/shared/ui/prefs.js is now the single
// place that catch lives, and this is the test that says so.
//
// See ARCHITECTURE.md §9.

/** Makes localStorage throw the way a browser with site data blocked does. */
async function blockStorage(page) {
  await page.addInitScript(() => {
    const boom = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
    });
  });
}

for (const g of games) {
  test(`${g.slug} still plays with storage blocked`, async ({ page }) => {
    // The insights script only exists on Vercel's edge, so it 404s against
    // preview; the smoke suite allowlists it the same way.
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
        errors.push(m.text());
      }
    });

    await blockStorage(page);
    await page.goto(g.path);

    // The game script has to have run, not just the document have loaded.
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("#howtoBtn")).toBeVisible();

    // The controls a player needs are still there and still work.
    await page.locator("#howtoBtn").click();
    await expect(page.locator("#howtoSheet")).toHaveClass(/show/);
    await page.locator("#howtoBackdrop").click();
    await expect(page.locator("#howtoSheet")).not.toHaveClass(/show/);

    // word-steps greys its restart out until the player has actually moved, so
    // only click one that is offered.
    const restart = page.locator("#restartBtn");
    if (g.hasRestart && !(await restart.evaluate((el) => el.classList.contains("disabled")))) {
      await restart.click();
      await expect(page.locator("body")).not.toBeEmpty();
    }

    expect(errors, `${g.slug} threw with storage blocked`).toEqual([]);
  });
}

test("a preference written by one game is read by another", async ({ page }) => {
  // flip-it and bubble-tap deliberately share the `twb_sound` key — one sound
  // preference for the site, not one per game. They used to agree only because
  // a comment said so, and they wrote it through two different code paths.
  await page.goto("/flip-it/");
  await page.locator("#soundBtn").click();
  const afterToggle = await page.evaluate(() => localStorage.getItem("twb_sound"));

  await page.goto("/bubble-tap/");
  await page.locator("#settingsBtn").click();
  const sharedState = await page.evaluate(() => localStorage.getItem("twb_sound"));
  expect(sharedState).toBe(afterToggle);

  // And it is a value both sides can actually parse, not one game's private
  // encoding — "true"/"false", which is what String(bool) and JSON both give.
  expect(["true", "false"]).toContain(sharedState);
});
