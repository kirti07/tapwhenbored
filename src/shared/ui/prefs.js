/* Namespaced (`twb:`), crash-proof localStorage. Access can throw (Safari
 * private mode, blocked site data), so every call is guarded. Values are
 * strings; use getJSON/setJSON for objects.
 */

var PREFIX = "twb:";

/* Copied forward on first read, never deleted, so older builds still find them. */
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

/* Cached probe; each call still has its own try/catch as storage can be
   revoked mid-session. */
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

    /* Fall back to the legacy key and copy it forward. */
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

export function setJSON(key, value) {
  try {
    return set(key, JSON.stringify(value));
  } catch (e) {
    return false;
  }
}

/** A whole-number preference, or `fallback`. */
export function getInt(key, fallback = null) {
  var raw = get(key, null);
  if (raw === null) return fallback;
  var n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

