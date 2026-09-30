/* The player's local day (not UTC). Separate from leaderboard.js so games with
 * `leaderboard: false` do not bundle the Supabase client. */

export function localDay(date = new Date()) {
  var pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The ISO week as "IYYY-Www". Must match the database's
 * `to_char(day, 'IYYY-"W"IW')` exactly. Parses "YYYY-MM-DD" as local time;
 * `new Date(string)` would read it as UTC.
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
