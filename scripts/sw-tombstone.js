// Kill-switch worker (ARCHITECTURE.md §19). Emitted as /sw.js only when the
// build runs with TWB_SW=off: it deletes every twb-* cache, takes over open
// pages without a fetch handler, and unregisters itself.
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
