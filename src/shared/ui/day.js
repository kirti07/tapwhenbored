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

/**
 * The ISO week a day falls in, as "IYYY-Www" — the key a weekly board uses.
 *
 * It has to agree exactly with what the database derives, which is
 * `to_char(day, 'IYYY-"W"IW')`, or a page would read a board nobody writes to.
 * Hence the ISO rules rather than an approximation: weeks start Monday, and a
 * week belongs to whichever year holds its Thursday — which is why the last
 * days of December can legitimately report week 01 of the next year.
 *
 * Accepts the same "YYYY-MM-DD" string the rest of this module deals in, and
 * parses it as local time rather than through `new Date(string)`, which reads
 * a bare date as UTC and can land on the wrong day west of Greenwich.
 */
export function isoWeek(day = localDay()) {
  var parts = String(day).split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  // Shift to the Thursday of this week; its year is the ISO week-year.
  var dow = (d.getDay() + 6) % 7; // Monday 0 … Sunday 6
  d.setDate(d.getDate() - dow + 3);
  var thursday = new Date(d.getTime());

  // Week 1 is the week holding 4 January.
  var jan4 = new Date(thursday.getFullYear(), 0, 4);
  var jan4dow = (jan4.getDay() + 6) % 7;
  var week1Monday = new Date(jan4.getFullYear(), 0, 4 - jan4dow);

  var week = Math.round((thursday - week1Monday) / 604800000) + 1;
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
