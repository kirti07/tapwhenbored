// Applies the theme before the first stylesheet does, so a dark-mode player
// never sees a white flash.
//
// A stored choice always wins — using the toggle is an explicit decision and it
// has to stick. With nothing stored, the OS preference decides. It used to
// hard-default to light and ignore prefers-color-scheme entirely, which meant a
// phone in dark mode got a bright page until its owner found the switch, even
// though every game ships a complete dark palette.
//
// Read as a *string* at build time and inlined into every page's <head>; it is
// never imported. It has to stay inline and parser-blocking, which rules out
// both a module (always deferred) and an external script (an extra request
// that still cannot beat first paint).
//
// __DARK_THEME_COLOR__ is substituted per page from the registry's
// darkThemeColor, because the mobile status bar has to match that game's dark
// background rather than a site-wide default.
//
// ?theme=dark|light is read here, ahead of the stored choice, and is the
// reason this cannot live in a module. Sharing a game link is the whole point
// of the share button, and a link that carries its sender's theme has to apply
// it before the first stylesheet or the recipient gets a flash of the other
// one. It is treated as an explicit choice and stored, so it survives the next
// navigation within the site.
//
// The body must stay comment-free: vite.config.js collapses this file to a
// single line, which would swallow the rest of the file into a // comment.
try {
  var q = null;
  try {
    q = new URLSearchParams(location.search).get("theme");
  } catch (e) {}
  if (q !== "dark" && q !== "light") q = null;
  var s = q || localStorage.getItem("theme");
  var t =
    s === "dark" || s === "light"
      ? s
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  if (q) {
    try { localStorage.setItem("theme", q); } catch (e) {}
  }
  document.documentElement.setAttribute("data-theme", t);
  if (t === "dark") {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", "__DARK_THEME_COLOR__");
  }
} catch (e) {}
