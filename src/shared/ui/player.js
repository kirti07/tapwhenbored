/* Who this browser is: a name, an id, and a token.
 *
 * There is still no account and no password. The name is a label the player
 * writes on their own stickers, and it is not an identity in any sense the site
 * can verify — every board says so.
 *
 * What *is* uploaded, once a score goes to a board, is the id and the name.
 * The id is a UUID this browser made up for itself, so a board can group a
 * player's runs into one row; the token is a second UUID that never leaves
 * except to authorise a rename or a delete. The id travels on every board row
 * and is therefore public; the token is the only reason somebody who reads an
 * id off a board cannot rename its owner. See ARCHITECTURE.md §27.
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

/* Twenty-four, matching what the boards accept. The database rejects longer, so
   a larger cap here would only let the field promise something the board then
   refuses -- and worse than refuses: a name that passes this and fails the
   `players_name_shape` constraint raises inside submit_game_run and costs the
   player the score it was submitting. Keep this, player_name_ok() and that
   constraint in step. `clean()` is exported so an input can show what will be
   saved. */
var MAX = 24;

/**
 * A v4 UUID. Exported because a finished run needs one too, and two
 * generators would be two chances to emit something the `uuid` column rejects.
 *
 * `crypto.randomUUID` needs a secure context, which `npm run dev:lan` over
 * plain http on a phone is not, so it cannot be the only path. The fallback
 * still fills from `getRandomValues` where that exists and only reaches
 * `Math.random` when nothing better is offered — and the shape has to stay a
 * real UUID either way, because the column it lands in is typed `uuid`.
 */
export function newId() {
  try {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (e) { /* not a secure context */ }

  var bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch (e) {
    for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  var hex = [];
  for (var j = 0; j < 16; j++) hex.push((bytes[j] + 0x100).toString(16).slice(1));
  return (
    hex.slice(0, 4).join("") + "-" +
    hex.slice(4, 6).join("") + "-" +
    hex.slice(6, 8).join("") + "-" +
    hex.slice(8, 10).join("") + "-" +
    hex.slice(10, 16).join("")
  );
}

/** The whole stored record, always an object. */
function record() {
  var stored = getJSON(KEY, null);
  return stored && typeof stored === "object" ? stored : {};
}

/**
 * This browser's id and token, minted on first use and kept from then on.
 *
 * Minting on read rather than on first score keeps the caller simple: there is
 * no "not registered yet" state to handle anywhere. It writes, so it is not
 * free — but it writes once per browser, and a blocked localStorage simply
 * means a new pair each call, which degrades to an unranked player rather than
 * an error.
 */
export function identity() {
  var player = record();
  var changed = false;

  if (typeof player.id !== "string" || player.id.length !== 36) {
    player.id = newId();
    changed = true;
  }
  if (typeof player.token !== "string" || player.token.length !== 36) {
    player.token = newId();
    changed = true;
  }
  if (changed) setJSON(KEY, player);

  return { id: player.id, token: player.token };
}

/** What an unnamed player's stickers say. */
export var UNSIGNED = "Unsigned";

/** The stored name, or "" when none is set. */
export function getName() {
  var name = record().name;
  return typeof name === "string" ? name : "";
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
  var player = record();
  player.name = clean(name);
  return setJSON(KEY, player);
}

