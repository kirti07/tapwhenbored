// Service worker template (ARCHITECTURE.md §19). pwa() in vite.config.js fills
// the three placeholders and emits the result as dist/sw.js.
const BUILD = __BUILD__;
const SHELL = __SHELL__;
const PAGES = __PAGES__;

const PREFIX = "twb-v2-";
const CACHE = PREFIX + BUILD;
const TIMEOUT = 2000;

const fresh = (url) => new Request(url, { cache: "no-cache" });
// One handle per worker lifetime: a put after the cache is deleted (by the
// next build or the kill switch) lands nowhere instead of recreating it.
let handle;
const open = () => (handle ??= caches.open(CACHE));

self.addEventListener("install", (e) => {
  e.waitUntil(
    open()
      .then((c) => c.addAll(SHELL.map(fresh)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // caches.keys() is in creation order: keep this build and the one before.
      const ours = (await caches.keys()).filter((k) => k.startsWith("twb-"));
      const previous = ours.filter((k) => k.startsWith(PREFIX) && k !== CACHE).pop();
      await Promise.all(
        ours.filter((k) => k !== CACHE && k !== previous).map((k) => caches.delete(k)),
      );
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "warm") e.waitUntil(warm());
});

async function warm() {
  const cache = await open();
  for (const urls of PAGES) {
    const missing = [];
    for (const url of urls) if (!(await cache.match(url, { ignoreVary: true }))) missing.push(url);
    if (missing.length) await cache.addAll(missing.map(fresh)).catch(() => {});
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_vercel/") ||
    url.pathname === "/sw.js"
  ) {
    return;
  }
  if (req.mode === "navigate") {
    const key = url.origin + url.pathname;
    const net = network(e, key);
    e.waitUntil(net.catch(() => {}));
    e.respondWith(page(key, net));
  } else {
    e.respondWith(asset(e, req));
  }
});

async function network(e, key) {
  const res = (await e.preloadResponse) || (await fetch(e.request));
  if (res.ok && res.type === "basic" && !res.redirected) {
    const copy = res.clone();
    e.waitUntil(store(key, copy));
  }
  return res;
}

async function page(key, net) {
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT));
  const res = await Promise.race([net, timeout]).catch(() => null);
  if (res) return res;
  return (await cached(key)) || (await net.catch(() => null)) || offline();
}

async function asset(e, req) {
  const hit = await cached(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    e.waitUntil(store(req, copy));
  }
  return res;
}

async function store(req, res) {
  await (await open()).put(req, res);
}

// This build's cache first, so an unhashed file never comes from an older one.
// ignoreVary: module requests carry an Origin header the precache did not.
async function cached(req) {
  const opts = { ignoreVary: true };
  return (await caches.match(req, { ...opts, cacheName: CACHE })) || caches.match(req, opts);
}

function offline() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · Tap When Bored</title>
<style>
:root{color-scheme:light dark;--bg:#f3f2fa;--fg:#262b3d;--ac:#6b5fd0}
@media (prefers-color-scheme:dark){:root{--bg:#0b0c18;--fg:#e8e8f0;--ac:#a99ff0}}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;text-align:center;
background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,sans-serif}
button,a{font:inherit;color:var(--ac)}button{padding:12px 24px;border:2px solid var(--ac);border-radius:12px;background:none;min-height:48px}
</style></head><body><main>
<h1>You're offline</h1>
<p>This page isn't saved on this device yet.</p>
<p><button onclick="location.reload()">Retry</button></p>
<p><a href="/">Back to all games</a></p>
</main></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
