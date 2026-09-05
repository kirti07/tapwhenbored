/* The in-game theme toggle.
 *
 * The homepage had a switch and no game did, so a player who landed on a
 * shared link — which is most of the point of the share button — had to leave
 * the game and go to the shelf to change it. There is nothing game-specific
 * about wanting the lights off.
 *
 * The *initial* theme is not decided here. It is decided by the inlined
 * bootstrap in scripts/theme-bootstrap.js, which runs parser-blocking in the
 * head so no one sees a flash of the wrong palette; that snippet also handles
 * ?theme=dark|light. This module only handles changing it afterwards, which is
 * why it can be a deferred module without causing a flash.
 *
 * The storage key stays the unprefixed "theme" rather than moving to prefs.js.
 * The bootstrap cannot import anything — it is inlined as a string — so the
 * two have to agree on a literal, and the bootstrap is the one that cannot
 * change. A comment in both files is weaker than this being the only writer.
 */

var DARK = "dark";
var LIGHT = "light";

function root() {
  return document.documentElement;
}

/** The theme currently applied to the document. */
export function current() {
  return root().getAttribute("data-theme") === DARK ? DARK : LIGHT;
}

/* The mobile status bar should match the page it sits above. Rather than
   carrying a per-game colour table here, read the background the game just
   painted itself — the value is correct by construction for every theme a game
   defines, including ones added later. */
function syncMetaColor() {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  var style = getComputedStyle(root());
  var bg = (style.getPropertyValue("--bg") || style.getPropertyValue("--paper") || "").trim();
  if (bg) meta.setAttribute("content", bg);
}

/** Apply and persist a theme. */
export function set(theme) {
  var next = theme === DARK ? DARK : LIGHT;
  root().setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
  syncMetaColor();
  return next;
}

/** Flip the theme. Returns the new value. */
export function toggle() {
  return set(current() === DARK ? LIGHT : DARK);
}

/**
 * Wire an existing button as the theme toggle.
 *
 * The button is a plain icon button in `.top-actions`; it swaps its icon and
 * its label so both the sighted and the announced state stay truthful.
 */
export function initToggle(btn) {
  if (!btn) return;

  function sync() {
    var isDark = current() === DARK;
    /* The button switches *to* the other theme, so it is labelled with the
       destination, not the current state.

       Only the label is set here. Which glyph shows is decided in CSS from
       data-theme, so the right one is painted before this module even loads. */
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
