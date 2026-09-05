/* The homepage's only JavaScript.
 *
 * Everything here is progressive enhancement, and that is a hard rule rather
 * than a preference: the shelf, the intro and the FAQ are indexable content and
 * ARCHITECTURE.md §28 requires them to be static in the built HTML. This file
 * adds three things on top of a page that is already complete without it —
 * the theme toggle, your local bests, and the wall's numbers.
 *
 * If it fails to load, fails to run, or the network is gone, the page is a
 * shelf of games with an empty progress strip and a wall of dashes. That is the
 * degraded state, and it is an honest one: nothing claims a number it does not
 * have.
 */

import { games } from "./data/games.js";
import { get as getPref, getJSON } from "./shared/ui/prefs.js";
import { playedToday } from "./shared/ui/progress.js";
import { initToggle as initThemeToggle } from "./shared/ui/theme.js";
import { fetchAllBests, localDay } from "./shared/ui/leaderboard.js";
import { formatScore } from "./shared/ui/format.js";


// ---------- your bests, read from this device ----------

/**
 * The best this browser has stored for a game, or null.
 *
 * Each game owns its storage shape, so this is the one place that knows about
 * all of them. Three of the eight cannot answer:
 *   - marble-nostalgia and doodle-on write no best at all
 *   - word-steps keeps today's result only, and clears it at midnight
 * Those return null and render as an empty slot, which is true.
 */
function localBest(game) {
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

/**
 * Today's stickers, and each card's all-time best.
 *
 * Two different claims, deliberately kept apart by their labels. The strip says
 * what you have played *today* and empties at midnight; the badge on a card
 * says your best *ever* at that game. "You have a best of 82 moves" and "you
 * have not played today" are both true at once.
 */
function renderToday() {
  var earned = 0;

  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    var best = localBest(game);
    var slot = document.querySelector('[data-slot="' + game.slug + '"]');
    var badge = document.querySelector('[data-best="' + game.slug + '"]');
    var today = playedToday(game.slug);

    if (slot) {
      /* Set both ways round, not just on. This runs again on visibilitychange,
         and a tab that was open across midnight has to give the stickers back. */
      slot.classList.toggle("is-earned", Boolean(today));
      slot.classList.toggle("slot--e", !today);
    }
    if (today) earned += 1;

    /* The footer row is always the same height, so it must always hold
       something. A game you have never recorded a best in gets the invitation
       instead of a blank — reserving visible space for nothing was the defect
       this replaces. */
    var pill = document.querySelector('[data-new="' + game.slug + '"]');
    if (pill) pill.hidden = best !== null;
    if (badge) badge.hidden = best === null;

    if (best === null) continue;

    if (badge) {
      /* This badge is your own score, so it is not gated on the game having a
         public board — untangle keeps a local best and has none. A duration
         reads as a time and needs no unit after it; a count does. */
      var shown = formatScore(best, game.scoreFormat);
      if (shown) {
        badge.textContent = "Best ";
        var em = document.createElement("em");
        em.textContent =
          game.scoreFormat === "int" ? shown + " " + game.scoreUnit : shown;
        badge.appendChild(em);
      }
    }
  }

  var heading = document.getElementById("bookH");
  var progress = document.getElementById("bookProgress");
  var bar = progress && progress.querySelector("i");

  var label =
    earned === 0
      ? "Play a game to start today's book"
      : earned === games.length
        ? "Every sticker, today — all " + games.length + " of them"
        : earned + " of " + games.length + " played today";

  if (heading) heading.textContent = label;
  if (progress) {
    progress.setAttribute(
      "aria-label",
      earned === 0 ? "Nothing played today" : label,
    );
  }
  if (bar) bar.style.width = (earned / games.length) * 100 + "%";
}

// ---------- the wall ----------

/**
 * Fills each tile with its game's global best.
 *
 * The tiles are already on the page at their final size; this only writes text
 * into them. A game with no row yet, or a request that fails, keeps its dash —
 * the wall never disappears and never shifts.
 */
async function renderWall() {
  var wall = document.getElementById("wall");
  if (!wall) return;

  var rows = await fetchAllBests();
  if (!rows) return;

  var today = localDay();
  var byGame = Object.create(null);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    // A daily game files its record under the date; everything else under "all".
    var wanted = row.period === "all" || row.period === today;
    if (wanted) byGame[row.game_slug] = row;
  }

  var tiles = wall.querySelectorAll(".stk");
  for (var t = 0; t < tiles.length; t++) {
    var tile = tiles[t];
    var slug = tile.dataset.slug;
    var game = games.find(function (g) { return g.slug === slug; });
    var record = byGame[slug];
    if (!game || !record || game.leaderboard === false) continue;

    var shown = formatScore(Number(record.best_score), game.scoreFormat);
    if (!shown) continue;

    tile.querySelector("[data-score]").textContent = shown;

    tile.dataset.updated = record.updated_at || "";
    tile.dataset.lower = game.leaderboard.lowerIsBetter ? "1" : "0";
  }
}

/**
 * The two sort orders, both real.
 *
 * "Best" cannot compare across games — a time and a move count are not the same
 * quantity — so it orders by how recently each record was *beaten*, which is
 * the closest honest reading of "best right now". "Just set" is the same field
 * ascending. Both use CSS order so nothing is removed from the DOM and the
 * tiles keep their identity for a screen reader.
 */
function initWallSort() {
  var wall = document.getElementById("wall");
  var buttons = document.querySelectorAll(".seg button");
  if (!wall || !buttons.length) return;

  var tiles = [].slice.call(wall.querySelectorAll(".stk"));
  var original = new Map();
  tiles.forEach(function (tile, i) { original.set(tile, i); });

  function apply(mode) {
    var ranked = tiles.slice().sort(function (a, b) {
      var au = a.dataset.updated || "";
      var bu = b.dataset.updated || "";
      // A tile with no record sinks in both orders rather than leading.
      if (!au && !bu) return original.get(a) - original.get(b);
      if (!au) return 1;
      if (!bu) return -1;
      return mode === "new" ? bu.localeCompare(au) : au.localeCompare(bu);
    });
    ranked.forEach(function (tile, i) { tile.style.order = String(i); });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      apply(btn.dataset.sort);
    });
  });
}

// ---------- start ----------

initThemeToggle(document.getElementById("themeBtn"));
renderToday();

/* A tab left open past midnight would keep showing yesterday's stickers. The
   records themselves already expire — playedToday() compares the stored day to
   today — so this only has to ask again. */
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) renderToday();
});
initWallSort();
renderWall();
