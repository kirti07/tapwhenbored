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

import { get as getPref, getJSON, setJSON } from "./prefs.js";
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

  bumpStreak(slug, day);
  return setJSON(key(slug), { day: day, score: next });
}

/* Every cabinet keeps a run, not just Word Steps.
 *
 * It used to be Word Steps alone, on the reasoning that a shared daily puzzle
 * is the only place "how many days running" means anything. The player card
 * disagrees: a run is a reason to come back to any of them, and the card shows
 * one sticker per cabinet you have one on.
 *
 * Same key shape as before — `word-steps.streak` still holds `{ day, run }`
 * under exactly that name — so nobody's existing run needed migrating. */
function streakKey(slug) {
  return slug + ".streak";
}

/** Yesterday, relative to a "YYYY-MM-DD" day, in the player's own timezone. */
function dayBefore(day) {
  var parts = String(day).split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() - 1);
  return localDay(d);
}

/**
 * Extend this game's streak, or start a new one.
 *
 * Only the last day and the count are kept — not a history — because the only
 * question anyone asks of it is "how many days running", and storing a row per
 * day to answer that would grow without limit for a number that fits in a byte.
 *
 * The `record.day === day` guard is what makes a second run on the same day
 * cost nothing: a streak counts days, not games, so playing twice before
 * midnight must not read as two days.
 *
 * A player who was already playing when this shipped starts at 1 rather than at
 * whatever they had earned. That is honest and it self-corrects in a day.
 */
function bumpStreak(slug, day) {
  var record = getJSON(streakKey(slug), null);
  if (!record || typeof record !== "object") record = { day: null, run: 0 };
  if (record.day === day) return;

  var run = record.day === dayBefore(day) ? (record.run || 0) + 1 : 1;
  setJSON(streakKey(slug), { day: day, run: run });
}

/**
 * How many days running on one game, or 0.
 *
 * A streak that did not reach yesterday is over, so it reads as 0 rather than
 * as its final length — a number that has stopped counting is not a streak.
 * Reaching *yesterday* still counts: the day is not lost until the player's own
 * midnight, and a card that wrote a run off at breakfast would be wrong for
 * most of the day it was wrong on.
 */
export function streak(slug) {
  var record = getJSON(streakKey(slug), null);
  if (!record || typeof record !== "object" || !Number.isFinite(record.run)) return 0;

  var today = localDay();
  if (record.day === today || record.day === dayBefore(today)) return record.run;
  return 0;
}

/** The homepage's one-line version, which only ever asks about Word Steps. */
export function wordStepsStreak() {
  return streak("word-steps");
}

/**
 * Every cabinet with a live run, longest first.
 *
 * Takes slugs rather than reading the registry, for the same reason
 * `recordPlay` takes `lowerIsBetter`: a caller that has the catalogue already
 * can hand over eight strings, and one that does not should not gain every
 * game's metadata in its bundle to ask this.
 */
export function streaks(slugs) {
  var live = [];
  for (var i = 0; i < slugs.length; i++) {
    var run = streak(slugs[i]);
    if (run > 0) live.push({ slug: slugs[i], run: run });
  }
  return live.sort(function (a, b) { return b.run - a.run; });
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

/**
 * A game's best result on this device, or null when it has none.
 *
 * This is the one function that knows all eight storage shapes, and that is
 * the point of it being here: two pages now ask the same question — the
 * homepage strip and the player card — and a second copy would be a second
 * answer. The shapes are not uniform because each game wrote its own first,
 * and normalising them would mean a migration for every player's stored data
 * to gain nothing a reader can see.
 *
 * Two of the eight cannot always answer: doodle-on keeps no score at all, and
 * word-steps keeps today's result only and clears it at midnight. Both return
 * null, and a caller renders that as an empty cell, which is true.
 *
 * Bests never leave the browser (ARCHITECTURE.md §27). The board knows a
 * player's rank; only this knows their best.
 */
export function localBest(game) {
  var slug = game.slug;

  if (slug === "flip-it") {
    // A map of level -> { moves, ms }. The best is the quickest solve on record.
    var byLevel = getJSON("flip-it.best", null);
    if (!byLevel || typeof byLevel !== "object") return null;
    var quickest = null;
    for (var k in byLevel) {
      var entry = byLevel[k];
      if (entry && Number.isFinite(entry.ms) && (quickest === null || entry.ms < quickest)) {
        quickest = entry.ms;
      }
    }
    return quickest;
  }

  if (slug === "word-steps") {
    // Scoped to one day by design; a stale day is not a best, it is nothing.
    var state = getJSON("word-steps.state", null);
    if (!state || typeof state !== "object") return null;
    if (!Number.isFinite(state.bestSteps)) return null;
    return state.bestSteps;
  }

  var raw = getPref(slug + ".best", null);
  if (raw === null) return null;
  var n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
