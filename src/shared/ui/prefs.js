// localStorage, with the try/catch already around it.
//
// Seven games carried a byte-identical copy of this pair. The eighth carried
// none, and read localStorage at module scope — so in Safari private mode, or
// any browser set to block site data, bubble-tap threw before the game
// initialised while the other seven degraded silently.
//
// Storage can throw on *read* as well as write, and it can be present but
// empty. Every path here answers with the fallback instead.
//
// KEYS ARE NOT RENAMED. This takes the full key and passes it straight through.
// The names it inherited are inconsistent — untangleBestMoves, flipIt:v2,
// twb_sound — and normalising them was tempting and wrong: a rename resets
// every player's best score, saved level, sound preference and in-progress
// Word Steps puzzle, silently, on deploy. New keys should be spelled
// `twb:<scope>:<name>`; the old ones keep the names they have.
//
// One key deliberately stays outside this module: `theme`. It is read and
// written by scripts/theme-bootstrap.js and by the homepage's theme toggle,
// both of which are inline parser-blocking scripts that cannot import a module.
// Routing half of that pair through here would be worse than leaving both.
//
// See ARCHITECTURE.md §9.

/**
 * The stored value for `key`, or `fallback` if there is nothing usable there.
 *
 * Values are JSON where a game stored JSON and a bare string where it stored a
 * string — `String(42)` and `JSON.stringify(42)` agree, but `String("dark")`
 * and `JSON.stringify("dark")` do not, and the keys predate this module. So
 * parse is attempted and a parse failure means the value was always a plain
 * string. That is what lets every existing key keep its existing name.
 */
export function get(key, fallback = null) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch (e) {
    return fallback;
  }
  if (raw === null) return fallback;

  try {
    return JSON.parse(raw);
  } catch (e) {
    return raw;
  }
}

/**
 * Stores `value` under `key`. Never throws.
 *
 * Strings are written as-is and everything else as JSON, which is what the
 * per-game helpers this replaced did: `String(v)` for numbers and booleans,
 * `JSON.stringify` for objects. Failure is silent by design — a player with
 * storage blocked should lose their best score, not their game.
 */
export function set(key, value) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch (e) {
    /* storage unavailable or full — the game carries on without it */
  }
}
