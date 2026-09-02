// Registry-driven smoke coverage: every game in games.js is tested here, so
// adding a game adds it to this suite automatically (ARCHITECTURE.md §30).
//
// Assertions that do not hold for every game are gated on registry capability
// flags rather than assumed. `.stage`, `#overlay` and `#restartBtn` are each
// missing from at least one game, so only `.back-link`, `.seo-info` and
// `#shareBtn` are asserted unconditionally.

import { test, expect } from "@playwright/test";
import { games, home, SITE_URL } from "../../src/data/games.js";

// Requests that are expected to fail outside Vercel. The Analytics script is
// served by Vercel's edge, not by the build, so it 404s in dev and preview.
// Matched on URL rather than on console text: the browser's console message for
// a failed subresource does not name the URL, so filtering on text would
// suppress every 404 including real ones.
const EDGE_ONLY = [/\/_vercel\/insights\//];

/**
 * Collects failures for the whole page lifetime: uncaught exceptions, console
 * errors, and any subresource that did not load.
 *
 * Returns a getter rather than an array so a test reads it after acting.
 */
function collectErrors(page) {
  const errors = [];
  const expected = (url) => EDGE_ONLY.some((re) => re.test(url));

  page.on("response", (res) => {
    if (res.status() < 400 || expected(res.url())) return;
    errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => {
    if (expected(req.url())) return;
    errors.push(`failed ${req.url()}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Subresource failures are asserted above, by URL. Dropping the browser's
    // URL-less duplicate keeps one failure from being reported twice.
    if (text.startsWith("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`uncaught: ${err.message}`));
  return () => errors;
}

test.describe("homepage", () => {
  test("lists every registered game and links to it", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(home.path);

    for (const g of games) {
      const card = page.locator(`a[href="${g.path}"]`);
      await expect(card, `card for ${g.slug}`).toHaveCount(1);
      await expect(card).toContainText(g.title);
    }
    // Nothing extra: the shelf is exactly the registry.
    await expect(page.locator("main.shelf > a")).toHaveCount(games.length);
    expect(errors()).toEqual([]);
  });

  test("thumbnails load", async ({ page }) => {
    await page.goto(home.path);
    for (const g of games) {
      const ok = await page.evaluate(
        (src) =>
          new Promise((res) => {
            const img = new Image();
            img.onload = () => res(img.naturalWidth > 0);
            img.onerror = () => res(false);
            img.src = src;
          }),
        g.thumb,
      );
      expect(ok, `thumbnail ${g.thumb}`).toBe(true);
    }
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.goto(home.path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});

for (const g of games) {
  test.describe(`${g.slug}`, () => {
    test("loads and initialises without errors", async ({ page }) => {
      const errors = collectErrors(page);
      const res = await page.goto(g.path);

      expect(res?.status(), `${g.path} status`).toBe(200);
      expect(new URL(page.url()).pathname).toBe(g.path);

      // Present on every game page.
      await expect(page.locator(".back-link")).toHaveCount(1);
      await expect(page.locator("#shareBtn")).toHaveCount(1);
      await expect(page.locator(".seo-info")).toHaveCount(1);

      // Capability-gated.
      if (g.hasRestart) await expect(page.locator("#restartBtn")).toHaveCount(1);
      if (g.hasOverlay) await expect(page.locator("#overlay")).toHaveCount(1);

      // The game script is a module and must actually have executed. Every game
      // builds its playfield in JS, so a populated body is the proof.
      await expect(page.locator("body")).not.toBeEmpty();
      expect(errors(), `console errors on ${g.path}`).toEqual([]);
    });

    test("canonical matches the registry", async ({ page }) => {
      await page.goto(g.path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${SITE_URL}${g.path}`,
      );
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        "content",
        `${SITE_URL}${g.path}`,
      );
    });

    test("no horizontal overflow", async ({ page }) => {
      await page.goto(g.path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${g.slug} overflows horizontally`).toBe(false);
    });

    test("back link returns to the homepage", async ({ page }) => {
      await page.goto(g.path);
      await page.locator(".back-link").click();
      await expect(page).toHaveURL(new RegExp(`${home.path}$`));
    });
  });
}

test.describe("routing", () => {
  test("a slugless game URL redirects to the canonical trailing slash", async ({
    request,
  }) => {
    const res = await request.get("/honeycomb", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(new URL(res.headers()["location"], SITE_URL).pathname).toBe("/honeycomb/");
  });

  test("an unknown path 404s rather than serving the homepage", async ({ request }) => {
    const res = await request.get("/not-a-real-game/");
    expect(res.status()).toBe(404);
  });

  test("sitemap lists exactly the registry", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const expected = [home, ...games].map((e) => `${SITE_URL}${e.path}`).sort();
    expect(locs).toEqual(expected);
  });
});
