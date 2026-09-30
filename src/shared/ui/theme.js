/* The in-game theme toggle. The initial theme is set by the inlined
 * scripts/theme-bootstrap.js; this only handles changes afterwards.
 * The key stays the unprefixed "theme" because the bootstrap reads that literal.
 */

var DARK = "dark";
var LIGHT = "light";

function root() {
  return document.documentElement;
}

function current() {
  return root().getAttribute("data-theme") === DARK ? DARK : LIGHT;
}

/* Match the mobile status bar to the game's own computed background. */
function syncMetaColor() {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  var style = getComputedStyle(root());
  var bg = (style.getPropertyValue("--bg") || style.getPropertyValue("--paper") || "").trim();
  if (bg) meta.setAttribute("content", bg);
}

function set(theme) {
  var next = theme === DARK ? DARK : LIGHT;
  root().setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
  syncMetaColor();
  return next;
}

function toggle() {
  return set(current() === DARK ? LIGHT : DARK);
}

/** Wire an existing `.top-actions` icon button as the theme toggle. */
export function initToggle(btn) {
  if (!btn) return;

  function sync() {
    var isDark = current() === DARK;
    /* Labelled with the destination theme. The glyph is chosen in CSS from
       data-theme so it is right before this module loads. */
    btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    btn.setAttribute("title", isDark ? "Light theme" : "Dark theme");
  }

  btn.addEventListener("click", function () {
    toggle();
    sync();
  });

  sync();
  return { sync: sync };
}
