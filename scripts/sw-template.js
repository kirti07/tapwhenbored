// Service worker source. Not shipped as-is: the build substitutes the version
// and precache placeholders below and emits the result to /sw.js, which is the
// only path that gives it root scope.
//
// Two rules shape everything here (ARCHITECTURE.md §19):
//
// 1. Installing must not download every game. Only the app shell is
//    precached; a game's page and assets enter the cache the first time it is
//    opened. The cache stays proportional to what the player actually plays,
//    and that is still true at fifty games.
//
// 2. This is an MPA, so there is no navigation fallback. Every flat URL is a
//    real document; answering a navigation with a cached shell would break both
//    gameplay and SEO.

const VERSION = "__VERSION__";
const SHELL_CACHE = `twb-shell-${VERSION}`;
const RUNTIME_CACHE = `twb-runtime-${VERSION}`;

// The homepage and the assets it needs, with their hashed filenames resolved at
// build time. Deliberately does not include any game.
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, not addAll: one 404 must not fail the whole install and
      // leave the user with no offline support at all.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from an older build. Hashed filenames mean a stale
      // entry can never be served against a new document, so there is nothing
      // to preserve across versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("twb-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Same-origin GETs are the only thing this worker handles. */
function isCacheable(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  // Analytics and any future API must never be cached, and must never block.
  if (url.pathname.startsWith("/_vercel/")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isCacheable(request, url)) return;

  // Leaderboard traffic is cross-origin so it never reaches here, but be
  // explicit: nothing under /rest/v1/ is ever served from cache.
  if (url.pathname.startsWith("/rest/v1/")) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) {
        // Cache-first, then refresh in the background so a returning player
        // gets the new build on the visit after it ships.
        event.waitUntil(refresh(request));
        return cached;
      }

      try {
        const response = await fetch(request);
        // Store what this visit actually used. That is what makes a game
        // offline-capable by being played, rather than by being installed.
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        // Offline and never cached. For a document this is an unvisited game,
        // so say so rather than showing a broken page.
        if (request.mode === "navigate") {
          return new Response(offlinePage(), {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return Response.error();
      }
    })(),
  );
});

async function refresh(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
  } catch {
    // Offline. The cached copy already went back to the page.
  }
}

function offlinePage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not available offline — Tap When Bored</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center;
         font: 16px/1.5 -apple-system, "Segoe UI", sans-serif;
         background: #f6f6fb; color: #262b3d; text-align: center; padding: 24px; }
  @media (prefers-color-scheme: dark) { body { background: #0d0e1a; color: #e8e8f0; } }
  a { color: #8b7fe0; }
  p { max-width: 32ch; }
</style></head>
<body><div>
  <h1>You're offline</h1>
  <p>This game hasn't been opened on this device yet, so there's no copy saved.</p>
  <p><a href="/">Back to the games you have</a></p>
</div></body></html>`;
}
