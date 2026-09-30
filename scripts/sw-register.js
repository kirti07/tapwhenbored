// Registers the service worker after load, then asks it to cache the rest of
// the shelf when the browser is idle (ARCHITECTURE.md §19). Top-level pages
// only: a party round in an iframe is already covered by its parent.
//
// Inlined into every built page as a single line, so the body carries no
// `//` comments.
(function () {
  if (!("serviceWorker" in navigator) || window.self !== window.top) return;
  addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js")
      .then(function () {
        return navigator.serviceWorker.ready;
      })
      .then(function (r) {
        var c = navigator.connection;
        if (c && (c.saveData || /2g/.test(c.effectiveType))) return;
        (window.requestIdleCallback || setTimeout)(function () {
          if (r.active) r.active.postMessage("warm");
        });
      })
      .catch(function () {});
  });
})();
