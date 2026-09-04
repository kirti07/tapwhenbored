// Registers the service worker, and applies a new build to a page that is
// already open.
//
// Registration waits for idle so it never competes with the page's own startup.
// Not on "load": that waits for every image and for the analytics tag, which is
// the slowest thing on the page and is deliberately outside the worker's scope
// — so a slow first visit installed the worker late, and the *next* launch
// still had no shell cached. Idle gets the same non-competition without
// chaining to it.
//
// The worker posts "twb:activated" once a new build has installed, claimed the
// page and dropped the previous shell. Only the shelf acts on it. Reloading
// there is a cache read — install finished before activate ran, so the new
// homepage and the /static/ hashes it names are already in the new shell — so
// it costs no round trip and still works offline. Three guards:
//
//   * The shelf only. A game is mid-play and is never reloaded (§20); it picks
//     up the new build the next time it is opened.
//   * Not the first-ever install, which claims an uncontrolled page with
//     nothing newer to show. That is what `had` records, read before
//     registering.
//   * Not once the player has touched the page. Swapping the shelf under a
//     finger already reaching for a card is worse than one stale launch, and
//     the next launch is current regardless.
//
// startMessages() is not optional: a listener added with addEventListener
// rather than assigned to onmessage leaves messages queued until it is called,
// which would silently drop the one message this whole path exists for.
//
// An installed PWA that is resumed rather than cold-launched never navigates,
// so without visibilitychange nothing would check for a new build at all.
// Throttled, so bouncing in and out of the app is not a request each time.
//
// Read as a *string* at build time and inlined into every page; it is never
// imported, and it is wrapped so that a page sharing a global with a game is
// not a thing anyone has to think about. Failure is swallowed throughout: the
// PWA is an enhancement and must never affect whether a game runs.
(function () {
  if (!("serviceWorker" in navigator)) return;

  var had = !!navigator.serviceWorker.controller;
  var touched = false;
  var checked = 0;

  addEventListener(
    "pointerdown",
    function () {
      touched = true;
    },
    { once: true, passive: true, capture: true },
  );

  navigator.serviceWorker.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "twb:activated") return;
    if (had && !touched && location.pathname === "/") location.reload();
  });
  if (navigator.serviceWorker.startMessages) navigator.serviceWorker.startMessages();

  addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - checked < 900000) return;
    checked = Date.now();
    navigator.serviceWorker.getRegistration().then(function (g) {
      if (g) g.update();
    }, function () {});
  });

  var register = function () {
    checked = Date.now();
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  };
  "requestIdleCallback" in window
    ? requestIdleCallback(register, { timeout: 3000 })
    : addEventListener("load", register);
})();
