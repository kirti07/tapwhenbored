// Service worker source. Not shipped as-is: the build substitutes the version
// and precache placeholders below and emits the result to /sw.js, which is the
// only path that gives it root scope.
//
// Three rules shape everything here (ARCHITECTURE.md §19):
//
// 1. Installing must not download every game. Only the app shell is
//    precached; a game's page and assets enter the cache the first time it is
//    opened. The cache stays proportional to what the player actually plays,
//    and that is still true at fifty games.
//
// 2. This is an MPA, so there is no navigation fallback. Every flat URL is a
//    real document; answering a navigation with a cached shell would break both
//    gameplay and SEO.
//
// 3. Everything is cache-first, documents included. A document is the only
//    file here that is not content-hashed, so it is the only one a stale cache
//    entry can serve against a new build — but that staleness is bounded to a
//    single launch, and that launch is internally consistent, because the old
//    document's /static/ hashes are in the same cache it came from. The next
//    launch is current: install precaches "/" with `cache: "reload"` and
//    activate drops every older twb-* cache.
//
//    Documents were network-first for one commit. The cost was a cold start on
//    an installed PWA blocking on the network before anything could paint —
//    under the launch splash, with a perfectly good copy of the page already in
//    the cache. Paying that round trip to avoid one stale launch is the wrong
//    trade for a site whose promise is that a game opens instantly.

const VERSION = "__VERSION__";
const SHELL_CACHE = `twb-shell-${VERSION}`;

// Deliberately not versioned. VERSION is a hash over every emitted filename, so
// a one-line fix to one game changes it for the whole site — and when the
// runtime cache carried the version too, that deploy threw away every game the
// player had made offline-capable. Nothing in here needs discarding on a
// version bump: /static/ entries are content-hashed, so a filename *is* its
// content and an entry can never be wrong, and a game's document is refreshed
// behind the response while staying consistent with the hashed files cached
// beside it. The homepage keeps its hard freshness guarantee by living in the
// shell, which is still versioned.
//
// The cost is that superseded /static/ chunks are never reclaimed. That is a
// few hundred kB per deploy, for games the player actually reopens, against an
// origin quota measured in megabytes. It is not self-pruning; if it ever needs
// to be, that is a deliberate change and not a bug fix.
const RUNTIME_CACHE = "twb-runtime";

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
      // Drop every older *shell*. This is what bounds a stale homepage to a
      // single launch: the previous version's copy is gone by the time the next
      // navigation asks for it, and install has already put the current build's
      // in its place. The runtime cache is exempt — see RUNTIME_CACHE above.
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

  event.respondWith(cacheFirst(request, event));
});

/** One strategy for everything: the cache, refreshed behind the response. */
async function cacheFirst(request, event) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) {
    // Refresh behind the response, for the runtime entries whose filenames are
    // not content-hashed: a game's document, and the files under /assets/.
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
    // Offline and never cached. For a document this is an unvisited game, so
    // say so rather than showing a broken page.
    if (request.mode === "navigate") {
      return new Response(offlinePage(), {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return Response.error();
  }
}

async function refresh(request) {
  const shell = await caches.open(SHELL_CACHE);
  const inShell = await shell.match(request, { ignoreVary: true });

  // The homepage document is the one entry that must not be refreshed here. It
  // is the guaranteed offline entry point, and install republishes it
  // atomically with the /static/ hashes it names; refreshing it on its own
  // could pair a new document with hashes nothing has cached yet.
  //
  // Everything else in the shell is a leaf — a thumbnail, a font, an icon — and
  // refreshing it in place is not optional. Those files live in public/, which
  // is copied verbatim and never content-hashed, so replacing one changes no
  // filename, bumps no VERSION, and never re-runs install. Skipping them would
  // freeze them on installed devices forever.
  if (inShell && request.mode === "navigate") return;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      // Back into the cache it came from. caches.match() searches the shell
      // before the runtime cache, so a refreshed shell file written to the
      // runtime cache would sit there unread.
      const cache = inShell ? shell : await caches.open(RUNTIME_CACHE);
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
