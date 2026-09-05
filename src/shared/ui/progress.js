/* Today's play record: which games have been finished today, and with what.
 *
 * This is what makes the sticker book a book rather than a list. A game's
 * sticker lights up when the player finishes it today, and the whole book
 * empties at midnight — so there is something to come back for tomorrow.
 *
 * Two decisions worth knowing before changing anything here.
 *
 * "Finished" means played to an end state, not won. Three games can end without
 * the player succeeding, and bubble-tap has no win state at all — its only
 * ending is hitting a bomb. doodle-on has neither a win nor a loss, just a
 * thirty-second clock. If a sticker required a win, those two slots could never
 * be filled and "8 of 8" would be permanently unreachable, which would look
 * like a bug rather than a rule.
 *
 * One key per game, not one shared object. A single `twb:today` holding all
 * eight would be clobbered the moment two games are open in two tabs: both read
 * the same object, both add their own result, and the second write loses the
 * first. Eight small keys cannot race.
 *
 * Nothing here ever cleans up yesterday. A record simply stops counting when
 * its day is no longer today, which means there is no sweep to schedule, no
 * midnight timer to get wrong, and no state to repair if the browser was closed
 * over the boundary.
 */

import { getJSON, setJSON } from "./prefs.js";
import { localDay } from "./day.js";

function key(slug) {
  return slug + ".today";
}

/**
 * Record that this game was played to an end state today.
 *
 * `score` may be null — doodle-on produces a drawing, not a number, and a
 * played slot with no score is still a played slot.
 *
 * A second run on the same day keeps the better score, so the book shows your
 * best of the day rather than your most recent. `lowerIsBetter` is passed in
 * rather than looked up in the registry: a game importing the whole catalogue
 * to learn one boolean would put every other game's metadata in its bundle.
 */
export function recordPlay(slug, score, lowerIsBetter) {
  var day = localDay();
  var previous = getJSON(key(slug), null);
  var next = Number.isFinite(score) ? score : null;

  if (previous && previous.day === day && Number.isFinite(previous.score)) {
    if (next === null) {
      next = previous.score;
    } else {
      next = lowerIsBetter
        ? Math.min(previous.score, next)
        : Math.max(previous.score, next);
    }
  }

  return setJSON(key(slug), { day: day, score: next });
}

/**
 * This game's record for today, or null.
 *
 * A record from any other day reads as null rather than as stale data, which is
 * the whole of the daily reset.
 */
export function playedToday(slug) {
  var record = getJSON(key(slug), null);
  if (!record || typeof record !== "object") return null;
  if (record.day !== localDay()) return null;
  return record;
}

/** How many of `slugs` have been played today. */
export function countPlayedToday(slugs) {
  var n = 0;
  for (var i = 0; i < slugs.length; i++) {
    if (playedToday(slugs[i])) n += 1;
  }
  return n;
}
