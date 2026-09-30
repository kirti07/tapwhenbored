// Applies the theme before first paint, so dark-mode players see no flash.
// Inlined as a string into every page's <head> and parser-blocking on purpose,
// so it cannot be a module or an external script.
//
// Order: ?theme=dark|light (stored as an explicit choice), then the stored
// choice, then the OS preference. __DARK_THEME_COLOR__ is substituted per page
// from the registry's darkThemeColor.
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
