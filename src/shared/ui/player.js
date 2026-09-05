/* The player's name, on this device.
 *
 * There is no account and no server behind this. The name is a label the player
 * writes on their own stickers; it is stored in this browser, is never uploaded,
 * and is not an identity in any sense the site can verify.
 *
 * Deliberately no generated default. The research on this design found that a
 * *name-shaped* placeholder like "Quiet Otter 42" is worse than an obviously
 * blank one, because it reads as a suggestion and invites people to replace it
 * with their real name — on a page that says the name goes on a public wall.
 * Unset reads as "Unsigned", which is honest and asks for nothing.
 *
 * Sanitising happens on write and rendering is always textContent, never
 * innerHTML. Every prototype in the research study stored `<b>hi</b>` verbatim;
 * this is the cheapest possible place to not do that.
 */

import { getJSON, setJSON } from "./prefs.js";

var KEY = "player";
var MAX = 16;

/** What an unnamed player's stickers say. */
export var UNSIGNED = "Unsigned";

/** The stored name, or "" when none is set. */
export function getName() {
  var player = getJSON(KEY, null);
  if (!player || typeof player !== "object") return "";
  return typeof player.name === "string" ? player.name : "";
}

/** The name to print on a sticker: the player's, or "Unsigned". */
export function signature() {
  return getName() || UNSIGNED;
}

/**
 * Trim, collapse runs of whitespace, and cap the length.
 *
 * Exported so the input can show the player what will actually be saved rather
 * than silently changing it underneath them.
 */
export function clean(name) {
  return String(name == null ? "" : name)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX);
}

/**
 * Save a name. An empty result clears it rather than storing a blank, so the
 * player can get back to "Unsigned" by emptying the field.
 */
export function setName(name) {
  var value = clean(name);
  return setJSON(KEY, { name: value });
}

/** The single letter an avatar shows. "?" when there is no name. */
export function initial() {
  var name = getName();
  return name ? name.charAt(0).toUpperCase() : "?";
}
