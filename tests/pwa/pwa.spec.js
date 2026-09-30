// The PWA layer (ARCHITECTURE.md §18, §19): what an install needs, and the
// service worker — network-first pages, cache-first files, offline play of a
// visited game, and cache cleanup across builds. Every other spec runs with
// workers blocked (playwright.config.js); this one opts back in.

import { test, expect } from "@playwright/test";
import { games, pages } from "../../src/data/games.js";

test.use({ serviceWorkers: "allow" });

/** Every pathname held in this build's cache. */
function cachedPaths(page) {
  return page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith("twb-v2-"));
    if (!name) return [];
    const reqs = await (await caches.open(name)).keys();
    return reqs.map((r) => new URL(r.url).pathname);
  });
}

/** Waits until the worker controls the page and has finished activating. */
async function controlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 10000,
    })
    .toBe(true);
}

/** Waits until the idle warm-up has cached every page. */
async function warmed(page) {
  const all = ["/", ...pages.map((p) => p.path), ...games.map((g) => g.path)];
  await expect
    .poll(async () => {
      const paths = await cachedPaths(page);
      return all.filter((p) => !paths.includes(p));
    }, {
      timeout: 20000,
    })
    .toEqual([]);
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

  test("iOS gets its touch icon and standalone tags", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect((await request.get(href)).status()).toBe(200);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      "content",
      "yes",
    );
  });

  test("every page links the manifest", async ({ page }) => {
    for (const path of ["/", ...pages.map((p) => p.path), ...games.map((g) => g.path)]) {
      await page.goto(path);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
        "href",
        "/manifest.webmanifest",
      );
    }
  });
});

test.describe("service worker", () => {
  test("registers, controls the page and precaches the shell", async ({ page }) => {
    await page.goto("/");
    await controlled(page);
    const paths = await cachedPaths(page);
    for (const p of ["/", "/manifest.webmanifest", "/fonts/nunito-latin-700.woff2"]) {
      expect(paths).toContain(p);
    }
  });

  test("warms every page when idle", async ({ page }) => {
    await page.goto("/");
    await controlled(page);
    await warmed(page);
  });

  test("a visited game plays offline, whatever its query", async ({ page, context }) => {
    await page.goto("/");
    await controlled(page);
    await warmed(page);

    await context.setOffline(true);
    try {
      await page.goto("/honeycomb/");
      await expect(page.locator("#board .tile").first()).toBeVisible();
      await page.goto("/flip-it/?utm_source=test");
      await expect(page.locator("#board .tile").first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("an unsaved page offline gets the offline page, not a browser error", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await controlled(page);

    await context.setOffline(true);
    try {
      await page.goto("/not-a-page/");
      await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("pages are network-first: a stale cached copy is replaced online", async ({ page }) => {
    await page.goto("/");
    await controlled(page);
    await page.evaluate(async () => {
      const name = (await caches.keys()).find((k) => k.startsWith("twb-v2-"));
      await (await caches.open(name)).put(
        "/honeycomb/",
        new Response("<!doctype html><title>stale</title>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
    });

    await page.goto("/honeycomb/");
    await expect(page.locator("#board .tile").first()).toBeVisible();
    expect(await page.title()).not.toBe("stale");
  });

  test("the party API is never cached", async ({ page }) => {
    await page.goto("/");
    await controlled(page);
    await page.evaluate(() => fetch("/api/party/?r=ZZZZ").catch(() => {}));
    await warmed(page);
    expect((await cachedPaths(page)).filter((p) => p.startsWith("/api/"))).toEqual([]);
  });

  test("keeps this build's cache and the previous one, and nothing older", async ({
    page,
  }) => {
    // robots.txt carries no registration snippet, so the caches exist first.
    await page.goto("/robots.txt");
    await page.evaluate(async () => {
      for (const name of ["twb-shell-legacy", "twb-runtime", "twb-v2-older", "twb-v2-previous"]) {
        await (await caches.open(name)).put("/x", new Response("x"));
      }
    });

    await page.goto("/");
    await controlled(page);
    const keys = await page.evaluate(() => caches.keys());
    expect(keys).toHaveLength(2);
    expect(keys).toContain("twb-v2-previous");
    expect(keys.find((k) => k !== "twb-v2-previous")).toMatch(/^twb-v2-[0-9a-f]{12}$/);
  });

  test("/sw.js is served as a script", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");
  });
});
