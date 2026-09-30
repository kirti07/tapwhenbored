// The GA4 tag, inlined as a string into every page's <head> by vite.config.js.
//
// Only the library load and config are behind the hostname guard, which keeps
// localhost, CI and *.vercel.app previews out of the numbers. dataLayer and
// gtag are always defined so a later gtag("event") call never throws. Framed
// pages (party rounds) load nothing: the party page already counts the visit.
// The library loads after `load`, when idle (§19). Analytics must never affect
// whether a game runs (§19, §20, §26). The measurement ID is public.
//
// The body must stay comment-free: vite.config.js collapses this file to a
// single line, which would swallow the rest of the file into a // comment.
try {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  if (location.hostname.indexOf("tapwhenbored.com") > -1 && window.self === window.top) {
    window.addEventListener("load", function () {
      (window.requestIdleCallback || setTimeout)(function () {
        var s = document.createElement("script");
        s.async = true;
        s.src = "https://www.googletagmanager.com/gtag/js?id=G-NPERHK4GNM";
        document.head.appendChild(s);
      });
    });
    window.gtag("js", new Date());
    window.gtag("config", "G-NPERHK4GNM");
  }
} catch (e) {}
