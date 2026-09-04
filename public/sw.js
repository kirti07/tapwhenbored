// Tombstone.
//
// This site caches nothing and has no offline mode (ARCHITECTURE.md §19). This
// worker exists only to remove the caching worker that used to live at this
// URL: a device that still has it checks here for an update, finds a
// byte-different script, installs it — and all it does is drop every twb-*
// cache and unregister itself.
//
// It has no fetch handler, and it claims the pages the old worker was serving,
// so from the moment it activates nothing on this origin is answered out of a
// cache.
//
// Serving a 404 here would also work in Chromium, which drops a registration
// whose script has gone — but it leaves the caches behind, and other engines
// need not do it at all. This is the deterministic version.
//
// No page registers this. It must stay deployed for as long as any device might
// still be carrying the old worker.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("twb-")) await caches.delete(key);
      }
      // Claim before unregistering, not after: claim() is what takes the open
      // pages away from the old worker, and once the registration is gone
      // there is nothing left to claim with. The pages keep this worker as
      // their controller until they unload, and it has no fetch handler, so
      // they go to the network from here on.
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
