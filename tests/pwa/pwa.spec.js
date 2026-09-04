// The PWA layer.
//
// The test that matters most is the last one: visiting a single game must not
// pull the other six into the cache. That is the property that keeps install
// size proportional at fifty games (ARCHITECTURE.md §19), and it is the kind of
// thing that regresses silently the moment someone "helpfully" precaches more.
//
// Service workers only run on localhost or HTTPS, and only in a persistent
// context per test — so each test drives registration explicitly rather than
// assuming a worker is already live.

import { test, expect } from "@playwright/test";
import { games } from "../../src/data/games.js";

// Dev serves a deliberately self-unregistering worker so caching cannot fight
// HMR, so the caching behaviour can only be asserted against a real build.
const isDev = (baseURL) => String(baseURL).includes("5173");

/** Waits for a controlling service worker and for the shell precache to settle. */
async function activateWorker(page) {
  await page.goto("/");
  await page.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller !== null,
    null,
    { timeout: 15000 },
  );
  // Give install's precache a moment to finish writing.
  await page.waitForTimeout(500);
}

/** Every URL currently held in any twb-* cache. */
function cachedUrls(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith("twb-")) continue;
      const c = await caches.open(name);
      for (const req of await c.keys()) out.push(new URL(req.url).pathname);
    }
    return out;
  });
}

test.describe("manifest and icons", () => {
  test("the manifest is served and complete", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const m = JSON.parse(await res.text());
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBeTruthy();
    expect(m.theme_color).toBeTruthy();

    // Android paints the launch screen in background_color and cross-fades it
    // into the page. If the two colours differ, opening the app reads as a
    // coloured flash — which is exactly what a purple background_color over a
    // near-white page did.
    expect(m.background_color).toBe(m.theme_color);

    // Installability needs a 192 and a 512, and Android needs a maskable one
    // or it crops the artwork into a circle.
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons.some((i) => String(i.purpose).includes("maskable"))).toBe(true);
  });

  test("every declared icon actually exists", async ({ request }) => {
    const m = JSON.parse(await (await request.get("/manifest.webmanifest")).text());
    for (const icon of m.icons) {
      const res = await request.get(icon.src);
      expect(res.status(), `${icon.src} must exist`).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    }
  });

  test("every page links the manifest", async ({ page }) => {
    for (const path of ["/", ...games.map((g) => g.path)]) {
      await page.goto(path);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
        "href",
        "/manifest.webmanifest",
      );
    }
  });
});

test.describe("service worker", () => {
  test("registers and takes control", async ({ page, baseURL }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
    ).toContain("/sw.js");
  });

  test("precaches the shell but not any game", async ({ page, baseURL }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);

    const urls = await cachedUrls(page);
    expect(urls).toContain("/");

    // The whole point of §19: installing must not download the catalogue.
    for (const g of games) {
      expect(urls, `${g.slug} must not be precached`).not.toContain(g.path);
    }
  });

  // The shelf's own artwork is part of the homepage, not part of a game, and
  // without it a cold launch paints a screen of empty placeholder boxes that
  // fill in from the network afterwards. Asserted in both directions, because
  // the bound is the point: precaching the whole shelf would grow the install
  // with every game added.
  test("precaches the cards at the fold, and only those", async ({ page, baseURL }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);

    // Which cards are "at the fold" is decided once, in the card markup. Read
    // it back off the page rather than repeating the number here, so the two
    // cannot drift apart.
    const { eager, lazy } = await page.evaluate(() => {
      const src = (img) => new URL(img.getAttribute("src"), location.href).pathname;
      const imgs = [...document.querySelectorAll("main.shelf img.thumb")];
      return {
        eager: imgs.filter((i) => i.loading !== "lazy").map(src),
        lazy: imgs.filter((i) => i.loading === "lazy").map(src),
      };
    });
    expect(eager.length, "some cards must be eager").toBeGreaterThan(0);
    expect(lazy.length, "some cards must be lazy").toBeGreaterThan(0);

    const urls = await cachedUrls(page);
    for (const thumb of eager) expect(urls, `${thumb} is at the fold`).toContain(thumb);
    for (const thumb of lazy) expect(urls, `${thumb} is below the fold`).not.toContain(thumb);
  });

  test("a launch does not wait on the network", async ({ page, context, baseURL }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);

    // Everything from here on takes three seconds to reach the server — the
    // shape of a cold start on a phone, where the radio and TLS have to come
    // back up before the document does. A cache-first worker never notices. A
    // network-first one holds the launch splash for the whole of it, which is
    // the regression this test exists for.
    await context.route("**/*", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });

    const started = Date.now();
    // "commit" rather than "load": the analytics tag is deliberately outside
    // the worker's scope, so waiting for load would time the delayed request
    // for it rather than the page.
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("main.shelf")).toBeVisible();

    // Not just the layout — the artwork. An empty shelf of placeholder boxes
    // that fills in afterwards is the thing this is meant to prevent, and it is
    // what happens when the thumbnails are left out of the precache.
    const firstCard = page.locator("main.shelf img.thumb").first();
    await expect
      .poll(() => firstCard.evaluate((img) => img.naturalWidth), {
        message: "the card at the fold must paint from cache, not load later",
        timeout: 2000,
      })
      .toBeGreaterThan(0);
    const elapsed = Date.now() - started;

    await context.unroute("**/*");
    expect(
      elapsed,
      "the homepage must come from the cache, not from a round trip",
    ).toBeLessThan(2000);
  });

  test("gameplay works offline after a visit, and reload still works", async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);

    // Open a game and play it, so its page and assets enter the runtime cache.
    await page.goto("/honeycomb/");
    await expect(page.locator("#board .tile").first()).toBeVisible();
    await page.locator("#board .tile--tappable").first().click();
    await page.waitForTimeout(600);

    // Reload once online so the document itself is definitely cached.
    await page.reload();
    await expect(page.locator("#board .tile").first()).toBeVisible();

    await context.setOffline(true);
    try {
      await page.reload();
      // The full core loop must still work with no network at all.
      await expect(page.locator("#board .tile").first()).toBeVisible();
      expect(await page.locator("#board .tile").count()).toBeGreaterThan(0);
      await page.locator("#board .tile--tappable").first().click();
      await page.waitForTimeout(400);
      expect(await page.locator("#board .tile").count()).toBeGreaterThan(0);

      // And the homepage, which was precached.
      await page.goto("/");
      await expect(page.locator("main.shelf")).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("visiting one game does not cache the others", async ({ page, baseURL }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);

    await page.goto("/honeycomb/");
    await expect(page.locator("#board .tile").first()).toBeVisible();
    await page.waitForTimeout(600);

    const urls = await cachedUrls(page);
    expect(urls).toContain("/honeycomb/");

    for (const g of games.filter((g) => g.slug !== "honeycomb")) {
      expect(urls, `${g.slug} was cached without being visited`).not.toContain(g.path);
    }
  });

  test("an unvisited game offline explains itself instead of breaking", async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);

    await context.setOffline(true);
    try {
      const res = await page.goto("/untangle/");
      // Not a browser error page, and not a cached shell pretending to be the
      // game: a real document that says what happened.
      expect(res?.status()).toBe(503);
      await expect(page.locator("body")).toContainText(/offline/i);
      await expect(page.locator('a[href="/"]')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("leaderboard requests are never served from cache", async ({ page, baseURL }) => {
    test.skip(isDev(baseURL), "dev ships a self-unregistering worker");
    await activateWorker(page);
    await page.goto("/honeycomb/");
    await page.waitForTimeout(600);

    const urls = await cachedUrls(page);
    expect(urls.filter((u) => u.includes("/rest/v1/"))).toEqual([]);
    expect(urls.filter((u) => u.includes("/_vercel/"))).toEqual([]);
  });
});
