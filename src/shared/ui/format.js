/* How a score is written down.
 *
 * There were five m:ss-family formatters in this codebase and no two agreed.
 * The same honeycomb run read "0:56" on the game's own end card and "0:56.8" in
 * the sticker book; flip-it zero-padded its minutes, so a nine-second solve
 * showed as "00:09". One number, three spellings, depending which page you were
 * looking at.
 *
 * So: one definition, whole seconds, everywhere a *score* is shown — end cards,
 * the book, the homepage badge, the wall.
 *
 * The trade that comes with whole seconds, stated rather than discovered later:
 * flip-it's solves cluster around nine to eleven seconds, so 0:09.4 and 0:09.8
 * both print as 0:09. Two genuinely different global bests can look identical
 * on the wall. That is the chosen behaviour.
 *
 * Running clocks are deliberately not in scope. word-steps counts down to
 * midnight in h:mm:ss and doodle-on counts down a fixed thirty seconds; those
 * are a different job with a different shape, and tenths on a ticking clock
 * would only flicker.
 */

/**
 * Milliseconds as m:ss.
 *
 * The null guard came from honeycomb, which was the only copy that had one and
 * was right to: its HUD renders before a run has a time.
 */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "--:--";
  var totalSec = Math.floor(Math.max(0, ms) / 1000);
  var m = Math.floor(totalSec / 60);
  var s = totalSec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

/**
 * When a record was set, in words.
 *
 * Relative for the fortnight where "how long ago" is the useful reading, then a
 * plain date, where it stops being. A record nobody has beaten in three months
 * is more interesting as a date than as "94 days ago".
 */
export function formatWhen(iso) {
  if (!iso) return "";
  var then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  var startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);

  if (days <= 0) return "set today";
  if (days === 1) return "set yesterday";
  if (days < 14) return "set " + days + " days ago";
  return "set " + then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * A registry score, formatted by its own `scoreFormat`.
 *
 * Returns null for anything that is not a finite number, so a caller can tell
 * "no score" from "a score of zero" and render a dash rather than a 0.
 */
export function formatScore(value, format) {
  if (!Number.isFinite(value)) return null;
  return format === "time" ? formatDuration(value) : value.toLocaleString();
}
