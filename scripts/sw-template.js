// Service worker source. Not shipped as-is: the build substitutes the version
// and precache placeholders below and emits the result to /sw.js, which is the
// only path that gives it root scope.
//
// Four rules shape everything here (ARCHITECTURE.md §19):
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
//    entry can serve against a new build — but that staleness lasts a moment,
//    not a launch, and what it shows in the meantime is internally consistent,
//    because the old document's /static/ hashes are in the same cache it came
//    from. Install precaches "/" with `cache: "reload"`, activate drops every
//    older twb-* shell and then tells the open pages, and the shelf swaps
//    itself to the new build out of the cache that install just filled.
//
//    Documents were network-first for one commit. The cost was a cold start on
//    an installed PWA blocking on the network before anything could paint —
//    under the launch splash, with a perfectly good copy of the page already in
//    the cache. Paying that round trip to avoid one stale launch is the wrong
//    trade for a site whose promise is that a game opens instantly. Announcing
//    the new build costs nothing and fixes the same problem.
//
// 4. A document is cached under its path, with the query stripped. See
//    cacheKey().

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

/**
 * The key a document is stored and looked up under: its path, no query.
 *
 * Every page's HTML is static per route. A shared challenge link like
 * /flip-it/?moves=12&size=5 is byte-identical to /flip-it/, and the game reads
 * those parameters from location.search at runtime, never from the document.
 * Keying on the full URL therefore bought nothing and cost three things: every
 * shared link was a guaranteed cache miss that paid a cold network round trip,
 * every distinct link left another copy of the same document in a runtime cache
 * that is never purged, and a shared link opened offline hit the "not available
 * offline" page for a game the player already had. It also dropped
 * /?utm_source=… into the runtime cache, where the homepage never again got the
 * shell's freshness guarantee.
 *
 * Subresources keep their full URL: /static/ hashes live in the query of
 * nothing, and stripping a query from an API call would be wrong.
 */
function cacheKey(request) {
  if (request.mode !== "navigate") return request;
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.toString());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const add = (url) => cache.add(new Request(url, { cache: "reload" }));

      // Individually, not addAll: one 404 on a leaf must not fail the whole
      // install and leave the user with no offline support at all.
      await Promise.all(
        PRECACHE.filter((url) => url !== "/").map((url) => add(url).catch(() => {})),
      );

      // The homepage is not a leaf and is not optional. A shell without its
      // entry point is worse than no new shell: "/" would be answered from the
      // runtime cache from then on, outside the versioning that bounds how
      // stale it can get. Retry once, then let install fail — the previous
      // worker stays in control and the next navigation tries again.
      await add("/").catch(() => add("/"));

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every older *shell*. This is what bounds a stale homepage: the
      // previous version's copy is gone by the time the next navigation asks
      // for it, and install has already put the current build's in its place.
      // The runtime cache is exempt — see RUNTIME_CACHE above.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("twb-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );

      // Evict anything the runtime cache holds that the shell now owns.
      //
      // Two ways a shell URL ends up there: a precache entry that 404'd or
      // failed to fetch during some earlier install, and a file that only later
      // became shell (a thumbnail joins the precache when its card moves above
      // the fold). Either way the copy predates this build, and a device in the
      // field is already in that state — this is the repair, so it has to run
      // on every activate rather than only when something new is added.
      const runtime = await caches.open(RUNTIME_CACHE);
      await Promise.all(
        PRECACHE.map((url) => runtime.delete(url, { ignoreSearch: true })),
      );

      await self.clients.claim();

      // Tell the pages that are already open. Claim first, so the reload a
      // client may do in response is served by this worker and finds the shell
      // install has just filled — a cache read, not a network round trip, and
      // one that works offline.
      //
      // What a client does with this is the client's business: the shelf swaps
      // itself, a game in progress ignores it (§20). The worker does not
      // reload anyone.
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.postMessage({ type: "twb:activated", version: VERSION });
      }
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

/**
 * The shell first, then the runtime cache — explicitly, by name.
 *
 * caches.match() without a cacheName searches every cache in *creation* order,
 * and that order inverts on the first redeploy: twb-runtime is created the
 * first time a game is opened, so every shell cache minted after it is searched
 * last. A URL held by both was then answered from the runtime copy for good,
 * while refresh() dutifully wrote the fresh one back into the shell where
 * nothing read it. Opening by name is the only way this ordering is a decision
 * rather than an accident.
 */
async function lookup(key) {
  const shell = await caches.open(SHELL_CACHE);
  const inShell = await shell.match(key, { ignoreVary: true });
  if (inShell) return { hit: inShell, cache: shell, inShell: true };

  const runtime = await caches.open(RUNTIME_CACHE);
  return {
    hit: await runtime.match(key, { ignoreVary: true }),
    cache: runtime,
    inShell: false,
  };
}

/** One strategy for everything: the cache, refreshed behind the response. */
async function cacheFirst(request, event) {
  const key = cacheKey(request);
  const { hit, inShell } = await lookup(key);

  if (hit) {
    // Refresh behind the response, for the entries whose filenames are not
    // content-hashed: a game's document, and the files under /assets/.
    event.waitUntil(refresh(request, key, inShell));
    return hit;
  }

  try {
    const response = await fetch(request);
    // Store what this visit actually used. That is what makes a game
    // offline-capable by being played, rather than by being installed.
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(key, response.clone());
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

async function refresh(request, key, inShell) {
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
      // Back into the cache it came from. lookup() reads the shell first, so a
      // refreshed shell file written to the runtime cache would sit unread.
      const cache = await caches.open(inShell ? SHELL_CACHE : RUNTIME_CACHE);
      await cache.put(key, response.clone());
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
