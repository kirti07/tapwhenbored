/* What day it is, for this player.
 *
 * Its own file rather than a corner of leaderboard.js, because two different
 * things need it and only one of them talks to a server. The daily sticker book
 * asks every game what day a round was played on, including untangle and
 * doodle-on — the two games that deliberately never contact Supabase
 * (`leaderboard: false`). Importing the leaderboard client to read a date would
 * put its URL and key constants in their bundles for nothing.
 *
 * The player's own timezone, not UTC. A book that empties at midnight has to
 * empty at *their* midnight, or someone in UTC+13 loses their evening's
 * stickers halfway through the evening.
 */

/** Today as "YYYY-MM-DD", in the player's timezone. */
export function localDay(date = new Date()) {
  var pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
