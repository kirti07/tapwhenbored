/* Today's play record for the player card, which empties at local midnight.
 * "Finished" means reached an end state, not won (bubble-tap and doodle-on
 * cannot win). One key per game so two open tabs cannot clobber each other.
 * Old days are never swept; they simply stop counting.
 */

import { get as getPref, getJSON, setJSON } from "./prefs.js";
import { localDay } from "./day.js";

function key(slug) {
  return slug + ".today";
}

/**
 * Record that this game was played to an end state today, keeping the day's
 * better score. `score` may be null. `lowerIsBetter` is passed in so games do
 * not bundle the registry.
 */
export function recordPlay(slug, score, lowerIsBetter) {
  // Party rounds (framed) stay in the party (§27).
  if (window.self !== window.top) return false;
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

/* Every game keeps a streak as `{ day, run }`. */
function streakKey(slug) {
  return slug + ".streak";
}

function dayBefore(day) {
  var parts = String(day).split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() - 1);
  return localDay(d);
}

/** Extend this game's streak or start one. Counts days, not games. */
function bumpStreak(slug, day) {
  var record = getJSON(streakKey(slug), null);
  if (!record || typeof record !== "object") record = { day: null, run: 0 };
  if (record.day === day) return;

  var run = record.day === dayBefore(day) ? (record.run || 0) + 1 : 1;
  setJSON(streakKey(slug), { day: day, run: run });
}

/** Days running on one game, or 0. A run ending yesterday is still live. */
function streak(slug) {
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

/** Every game with a live run, longest first. Takes slugs to avoid bundling the registry. */
export function streaks(slugs) {
  var live = [];
  for (var i = 0; i < slugs.length; i++) {
    var run = streak(slugs[i]);
    if (run > 0) live.push({ slug: slugs[i], run: run });
  }
  return live.sort(function (a, b) { return b.run - a.run; });
}

/** This game's record for today, or null. This is the daily reset. */
export function playedToday(slug) {
  var record = getJSON(key(slug), null);
  if (!record || typeof record !== "object") return null;
  if (record.day !== localDay()) return null;
  return record;
}

/**
 * A game's best result on this device, or null. The one place that knows each
 * game's storage shape. Bests never leave the browser (ARCHITECTURE.md §27).
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
