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
      await expect(page.locator("#howtoBtn")).toHaveCount(1);

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

    test("how to play opens, lists steps, and closes", async ({ page }) => {
      // Every game explains itself the same way. Two games shipped without any
      // instructions at all, so this is asserted for all of them rather than
      // gated on a capability flag.
      await page.goto(g.path);

      const sheet = page.locator("#howtoSheet");
      await expect(sheet).not.toHaveClass(/show/);

      await page.locator("#howtoBtn").click();
      await expect(sheet).toHaveClass(/show/);

      // Steps are bullets, not a paragraph.
      const steps = page.locator("#howtoSheet .howto-list li");
      expect(await steps.count()).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < (await steps.count()); i++) {
        await expect(steps.nth(i)).not.toBeEmpty();
      }
      // The sheet animates with transform, so it stays "visible" to Playwright
      // either way; the `show` class is the real state.
      await expect(page.locator("#howtoTitle, .howto-title")).toContainText(
        /how to play/i,
      );

      await page.locator("#howtoBackdrop").click();
      await expect(sheet).not.toHaveClass(/show/);
    });


    test("back link returns to the homepage", async ({ page }) => {
      await page.goto(g.path);
      await page.locator(".back-link").click();
      await expect(page).toHaveURL(new RegExp(`${home.path}$`));
    });
  });
}

test("the how-to sheet is laid out identically in every game", async ({ page }) => {
  // "Consistent" means the games agree with each other, not that they match a
  // constant: gap and font-size are vh-based, so the absolute pixels legitimately
  // differ between viewports. Colour is excluded — that is each game's accent.
  const geometryOf = async (g) => {
    await page.goto(g.path);
    await page.locator("#howtoBtn").click();
    await expect(page.locator("#howtoSheet")).toHaveClass(/show/);
    return page.evaluate(() => {
      const ul = document.querySelector(".howto-list");
      const li = ul.querySelector("li");
      const link = document.querySelector(".howto-link");
      const sheet = document.querySelector(".howto-sheet");
      const u = getComputedStyle(ul);
      const l = getComputedStyle(li);
      const k = getComputedStyle(link);
      const s = getComputedStyle(sheet);
      return {
        listPaddingLeft: u.paddingLeft,
        listRowGap: u.rowGap,
        listDisplay: u.display,
        listFlexDirection: u.flexDirection,
        itemDisplay: l.display,
        itemFontSize: l.fontSize,
        itemLineHeight: l.lineHeight,
        itemListStyleType: l.listStyleType,
        linkFontWeight: k.fontWeight,
        linkFontSize: k.fontSize,
        linkLetterSpacing: k.letterSpacing,
        sheetBorderRadius: s.borderTopLeftRadius,
        sheetPadding: s.paddingTop,
      };
    });
  };

  const reference = await geometryOf(games[0]);
  for (const g of games.slice(1)) {
    expect(await geometryOf(g), `${g.slug} differs from ${games[0].slug}`).toEqual(
      reference,
    );
  }
});

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
