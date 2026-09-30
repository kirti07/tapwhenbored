/* Who this browser is: a name, an id and a token. No account (§27).
 * The id is public on every board row; the token is secret and only authorises
 * a rename or delete. No generated default name: unset reads as "Unsigned".
 * Names are cleaned on write and must only ever be rendered via textContent.
 */

import { getJSON, setJSON } from "./prefs.js";

var KEY = "player";

/* Keep in step with player_name_ok() and the `players_name_shape` constraint:
   a longer name raises inside submit_game_run and loses the player's score. */
var MAX = 24;

/**
 * A v4 UUID for `uuid` columns. Falls back from `crypto.randomUUID`, which
 * needs a secure context (not `npm run dev:lan` over http).
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

function record() {
  var stored = getJSON(KEY, null);
  return stored && typeof stored === "object" ? stored : {};
}

/** This browser's id and token, minted on first read. */
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

export var UNSIGNED = "Unsigned";

export function getName() {
  var name = record().name;
  return typeof name === "string" ? name : "";
}

export function signature() {
  return getName() || UNSIGNED;
}

/** Trim, collapse whitespace, cap the length. Exported so inputs can preview it. */
export function clean(name) {
  return String(name == null ? "" : name)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX);
}

export function setName(name) {
  var player = record();
  player.name = clean(name);
  return setJSON(KEY, player);
}

