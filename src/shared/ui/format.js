/* How a score is written down, everywhere a score is shown. Whole seconds by
 * choice, so close times can print the same. Running clocks are out of scope.
 */

/** Milliseconds as m:ss; "--:--" before a run has a time. */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "--:--";
  var totalSec = Math.floor(Math.max(0, ms) / 1000);
  var m = Math.floor(totalSec / 60);
  var s = totalSec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

/** A registry score by its `scoreFormat`; null (not "0") when there is none. */
export function formatScore(value, format) {
  if (!Number.isFinite(value)) return null;
  return format === "time" ? formatDuration(value) : value.toLocaleString();
}
