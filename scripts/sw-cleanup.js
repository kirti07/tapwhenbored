// Removes the service worker this site used to ship, and its caches.
//
// There is no offline mode: nothing is cached, in a browser tab or in the
// installed app (§19). Shipping no worker is not enough on its own — a device
// that visited while there was one still has it registered, and an active
// worker keeps answering from copies of pages that have since changed, so it
// would go on serving an old build for as long as the player keeps the app.
// Every page therefore unregisters whatever it finds and deletes every twb-*
// cache.
//
// The main path for that is `public/sw.js`, the tombstone: a device whose
// worker is still active checks it for an update on its next navigation,
// installs it, and it wipes the caches and unregisters itself without the page
// having to be involved.
//
// This snippet is the other half, for the cases the tombstone cannot reach: a
// registration that has already gone while its caches stayed behind (Chromium
// drops a registration whose script 404s, and does not delete anything), and
// whatever a player has done by hand in DevTools. It is also what will still be
// true once the tombstone is deleted.
//
// Idempotent, and temporary in principle: once no device in the field still
// carries a worker, this file and its injection in vite.config.js can go.
//
// Read as a *string* at build time and inlined into every page; it is never
// imported, and it is wrapped so that a page sharing a global with a game is
// not a thing anyone has to think about. Failure is swallowed throughout: this
// is housekeeping and must never affect whether a game runs.
(function () {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) {
      rs.forEach(function (r) {
        r.unregister();
      });
    }, function () {});
  }
  if (window.caches) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) {
        if (k.indexOf("twb-") === 0) caches.delete(k);
      });
    }, function () {});
  }
})();
