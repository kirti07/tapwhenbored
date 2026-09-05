/* Namespaced, crash-proof access to localStorage.
 *
 * Two problems this exists to solve.
 *
 * The first is that `localStorage` throws. Not "returns null" — throws, on the
 * property access itself, in Safari private mode and anywhere a browser is set
 * to block site data. Seven of the eight games already wrapped every call in a
 * try/catch; bubble-tap did not, and its unguarded read sat inside a function
 * called during module init, so the whole game died before it drew a frame.
 * That is the entire class of bug: it is not enough for most callers to
 * remember, because the one that forgets takes the page down with it.
 *
 * The second is naming. The repo grew three conventions — `untangleBestMoves`,
 * `wordSteps:v1`, `twb_sound` — and nothing stopped a future key colliding with
 * one of them. Everything written through here gets a `twb:` prefix, so the
 * site's keys are greppable in devtools and can never collide with a key some
 * embedded script sets.
 *
 * LEGACY_KEYS migrates the old names forward on first read. It copies rather
 * than moves: a player who somehow loads an older build still finds their best
 * score where that build expects it. The cost is a handful of duplicated
 * strings in storage, which is the right price for not deleting somebody's
 * 40-day streak on a deploy.
 *
 * Values are strings, exactly as localStorage has them, with getJSON/setJSON
 * for the three games that store objects. Deliberately not a generic
 * serialising store: a `get` that sometimes returns a string and sometimes an
 * object is the kind of API that produces `"[object Object]"` in a HUD.
 */

var PREFIX = "twb:";

/* new short name -> the unprefixed key that build shipped before this file. */
var LEGACY_KEYS = {
  "untangle.best": "untangleBestMoves",
  "slide-n-order.best": "slideNOrderBest",
  "honeycomb.best": "honeycombBestTimeMs",
  "marble-nostalgia.played": "marbleNostalgiaPlayed",
  "flip-it.best": "flipIt:v2",
  "flip-it.recent": "flipItRecent",
  "flip-it.level": "flipItLevel",
  "word-steps.state": "wordSteps:v1",
  "bubble-tap.best": "twb_best",
  sound: "twb_sound",
  calm: "twb_calm",
};

/* One probe, cached. Every read and write still has its own try/catch — a
   browser can revoke storage mid-session — but this keeps the common blocked
   case from throwing and being caught once per call. */
var available = null;

function usable() {
  if (available !== null) return available;
  try {
    var probe = PREFIX + "_probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    available = true;
  } catch (e) {
    available = false;
  }
  return available;
}

/**
 * Read a preference. Returns `fallback` when the key is unset, when storage is
 * blocked, or when reading throws.
 */
export function get(key, fallback) {
  if (!usable()) return fallback === undefined ? null : fallback;
  try {
    var v = window.localStorage.getItem(PREFIX + key);
    if (v !== null) return v;

    /* Not found under the new name. Look for the pre-namespace key and, if it
       is there, copy it forward so this is the last time we look. */
    var legacy = LEGACY_KEYS[key];
    if (legacy) {
      var old = window.localStorage.getItem(legacy);
      if (old !== null) {
        try { window.localStorage.setItem(PREFIX + key, old); } catch (e) { /* full or blocked */ }
        return old;
      }
    }
    return fallback === undefined ? null : fallback;
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}

/**
 * Write a preference. Silent no-op when storage is unavailable or full —
 * a preference failing to persist must never interrupt play.
 */
export function set(key, value) {
  if (!usable()) return false;
  try {
    window.localStorage.setItem(PREFIX + key, String(value));
    return true;
  } catch (e) {
    return false;
  }
}

/** Read and parse a JSON preference. Malformed stored JSON reads as `fallback`. */
export function getJSON(key, fallback) {
  var raw = get(key, null);
  if (raw === null) return fallback === undefined ? null : fallback;
  try {
    var parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}

/** Serialise and write a JSON preference. */
export function setJSON(key, value) {
  try {
    return set(key, JSON.stringify(value));
  } catch (e) {
    return false;
  }
}

/** Remove a preference, and the legacy key it may have been migrated from. */
export function remove(key) {
  if (!usable()) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
    var legacy = LEGACY_KEYS[key];
    if (legacy) window.localStorage.removeItem(legacy);
  } catch (e) { /* ignore */ }
}
