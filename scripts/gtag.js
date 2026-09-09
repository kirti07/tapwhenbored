// The Google Analytics 4 tag, for the property G-NPERHK4GNM.
//
// Read as a *string* at build time and inlined into every page's <head>; it is
// never imported. Google's own instruction is to paste its snippet into every
// page immediately after <head>, which this deliberately does not do — see
// vite.config.js for why the tag is injected by a plugin and why it lands at
// the end of the head rather than the start.
//
// Only the remote library and the config call are behind the hostname guard.
// dataLayer and gtag are defined unconditionally, so a gtag("event", ...) call
// added to a game later queues harmlessly on localhost instead of throwing
// "gtag is not defined". The guard must not become a landmine for whoever adds
// the first event.
//
// The guard itself is what keeps the numbers honest. Playwright runs against a
// real production build on localhost:4173 across two device projects, so an
// unguarded tag would post a pageview for every page of every CI run, and the
// smoke suite — which fails on any request that does not load — would go red on
// a machine with no network. indexOf covers www and the apex, and excludes
// localhost, 127.0.0.1 and *.vercel.app preview deploys.
//
// Wrapped in try/catch throughout: analytics must never affect whether a game
// runs (ARCHITECTURE.md §19, §20, §26).
//
// The measurement ID is hardcoded rather than read from the environment. It is
// public by definition — it ships in the HTML of every page — and an env var
// would only add a way for production to build silently without a tag.
//
// The body must stay comment-free: vite.config.js collapses this file to a
// single line, which would swallow the rest of the file into a // comment.
try {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  if (location.hostname.indexOf("tapwhenbored.com") > -1) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=G-NPERHK4GNM";
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", "G-NPERHK4GNM");
  }
} catch (e) {}
