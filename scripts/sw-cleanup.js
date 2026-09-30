// Unregisters every service worker and deletes every twb-* cache. Inlined in
// place of the registration snippet on the dev server and in a TWB_SW=off
// build (ARCHITECTURE.md §19). Idempotent; failures are swallowed.
//
// Inlined as a single line, so the body carries no `//` comments.
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
