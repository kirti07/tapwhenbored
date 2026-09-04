// The PWA layer.
//
// The app is installable and nothing more: there is no service worker, no cache
// and no offline mode, in a browser tab or in the installed app
// (ARCHITECTURE.md §18, §19). So this file has two halves — the manifest and
// icons an install needs, and the absence of everything else, which is the part
// that would regress silently the moment someone reintroduces a worker.
//
// Service workers only run on localhost or HTTPS, so a registration left over
// from an older build is a real possibility here, and the cleanup that deals
// with it is asserted directly.

import { test, expect } from "@playwright/test";
import { games } from "../../src/data/games.js";

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

/** How many service-worker registrations this origin has. */
function registrations(page) {
  return page.evaluate(() =>
    navigator.serviceWorker.getRegistrations().then(
      (rs) => rs.length,
      () => 0,
    ),
  );
}

/**
 * Makes the page believe it was launched as an installed app.
 *
 * `display-mode` cannot be emulated — Chromium's `Emulation.setEmulatedMedia`
 * ignores the feature, and a real standalone window only comes from launching
 * the browser with `--app` — so the signal itself is stubbed, for this context
 * only and before any page script runs. Nothing in the site reads it any more,
 * which is exactly what the spec using this asserts: an install must not turn
 * caching back on.
 */
function asInstalledApp(context) {
  return context.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      String(q).includes("display-mode")
        ? {
            matches: true,
            media: String(q),
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          }
        : real(q);
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

test.describe("no worker, no cache, no offline", () => {
  test("no page registers a worker or caches anything", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main.shelf")).toBeVisible();
    await page.goto("/honeycomb/");
    await expect(page.locator("#board .tile").first()).toBeVisible();
    // Comfortably longer than any idle-callback registration would have taken.
    await page.waitForTimeout(1500);

    expect(await registrations(page), "nothing may register a worker").toBe(0);
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller === null),
      "no page may be controlled",
    ).toBe(true);
    expect(await cachedUrls(page), "nothing may be cached").toEqual([]);
  });

  // The point of removing it: an install buys an app window, not an offline
  // copy. Nothing reads display-mode any more, and this is what fails if a gate
  // on it ever comes back.
  test("an installed launch caches nothing either", async ({ page, context }) => {
    await asInstalledApp(context);

    await page.goto("/");
    await expect(page.locator("main.shelf")).toBeVisible();
    await page.goto("/flip-it/");
    await expect(page.locator("#board .tile").first()).toBeVisible();
    await page.waitForTimeout(1500);

    expect(
      await page.evaluate(() => matchMedia("(display-mode: standalone)").matches),
      "precondition: the page believes it is the installed app",
    ).toBe(true);
    expect(await registrations(page), "an install must not register a worker").toBe(0);
    expect(await cachedUrls(page), "an install must not cache").toEqual([]);
  });

  // /sw.js is a tombstone, not a caching worker: it exists so that a device
  // still carrying the old one installs something that deletes it. The update
  // check needs a real script at a real URL, so this must not 404.
  test("/sw.js is served as a script", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");
  });

  test("the tombstone removes itself and every twb-* cache", async ({ page }) => {
    await page.goto("/");
    // The page's own cleanup snippet has already run by now, so what happens
    // after this point is the worker's doing, not the page's.
    await page.waitForTimeout(500);

    await page.evaluate(async () => {
      const shell = await caches.open("twb-shell-legacy");
      await shell.put("/", new Response("stale"));
      const runtime = await caches.open("twb-runtime");
      await runtime.put("/honeycomb/", new Response("stale"));
      await navigator.serviceWorker.register("/sw.js");
    });

    await expect
      .poll(() => page.evaluate(() => caches.keys()), {
        message: "the tombstone must delete the old caches",
        timeout: 10000,
      })
      .toEqual([]);
    await expect
      .poll(() => registrations(page), {
        message: "and then unregister itself",
        timeout: 10000,
      })
      .toBe(0);
  });

  // With no fetch handler in the tombstone, a page it has claimed goes to the
  // network for everything — which is what stops the session that installs it
  // from carrying on out of the old cache.
  test("a page the tombstone claimed is not served from a cache", async ({
    page,
    context,
  }) => {
    await page.goto("/honeycomb/");
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        message: "the tombstone must claim this page",
        timeout: 10000,
      })
      .toBe(true);

    await context.setOffline(true);
    try {
      let failed = false;
      await page.reload().catch(() => {
        failed = true;
      });
      expect(failed, "a claimed page must have no cached copy to fall back on").toBe(
        true,
      );
    } finally {
      await context.setOffline(false);
    }
  });

  test("a visited game is not playable offline", async ({ page, context }) => {
    await page.goto("/honeycomb/");
    await expect(page.locator("#board .tile").first()).toBeVisible();
    await page.waitForTimeout(1000);

    await context.setOffline(true);
    try {
      let failed = false;
      await page.reload().catch(() => {
        failed = true;
      });
      expect(failed, "there must be no copy for the browser to serve").toBe(true);
      // And no worker-generated "not available offline" page either.
      await expect(page.locator("#board .tile")).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });

  // Devices that visited while the site still shipped a worker carry its caches
  // around, and an active worker would go on answering out of them. Every page
  // clears them; this is the half of that a test can drive.
  test("a cache left over from an earlier build is cleared", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const shell = await caches.open("twb-shell-legacy");
      await shell.put(
        "/",
        new Response("<!doctype html><title>stale", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
      const runtime = await caches.open("twb-runtime");
      await runtime.put("/honeycomb/", new Response("stale"));
    });
    expect(await cachedUrls(page), "precondition: a legacy cache exists").not.toEqual(
      [],
    );

    await page.reload();
    await expect
      .poll(() => page.evaluate(() => caches.keys()), {
        message: "a legacy cache must not survive a page load",
        timeout: 5000,
      })
      .toEqual([]);
  });
});
