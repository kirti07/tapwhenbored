/* The homepage's only JavaScript.
 *
 * Everything here is progressive enhancement, and that is a hard rule rather
 * than a preference: the shelf and the intro are indexable content and
 * ARCHITECTURE.md §28 requires them to be static in the built HTML. This file
 * adds three things to a page that is already complete without it — the theme
 * toggle, your best on each cabinet, and the roll's numbers.
 *
 * If it fails to load, fails to run, or the network is gone, the page is a
 * shelf of cabinets whose meta lines read "not played yet" and a roll of
 * dashes. That is the degraded state, and it is an honest one: nothing claims
 * a number it does not have.
 */

import { games } from "./data/games.js";
import { localBest, wordStepsStreak } from "./shared/ui/progress.js";
import { signature, UNSIGNED } from "./shared/ui/player.js";
import { initToggle as initThemeToggle } from "./shared/ui/theme.js";
import { fetchAllBests, localDay } from "./shared/ui/leaderboard.js";
import { formatScore } from "./shared/ui/format.js";

var boarded = games.filter(function (g) { return g.leaderboard !== false; });

/**
 * Each cabinet's meta line: your best at that game, on this device.
 *
 * The two games that keep no score already say so in the built HTML and are
 * left alone — "no board, on purpose" is not a thing script should be able to
 * overwrite. Everything else says "not played yet" until this proves otherwise,
 * and every state is one line tall, so nothing moves.
 */
function renderBests() {
  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    if (game.leaderboard === false) continue;

    var line = document.querySelector('[data-best="' + game.slug + '"]');
    if (!line) continue;

    var best = localBest(game);
    if (best === null) continue;

    var shown = formatScore(best, game.scoreFormat);
    if (!shown) continue;
    line.textContent = shown + " " + game.scoreUnit;
    line.classList.remove("card-m--dim");
  }
}

/**
 * The player card, from what this browser knows on its own.
 *
 * Deliberately no network: the card is right on the first frame and does not
 * change under the reader a moment later. How many boards you are actually
 * ranked on is a different question, and the board page answers it.
 */
function renderPlayer() {
  var name = signature();
  var chip = document.getElementById("idname");
  var card = document.getElementById("p1Name");
  if (chip) chip.textContent = name;
  if (card) card.textContent = name;

  var meta = document.getElementById("p1Meta");
  if (!meta) return;

  var played = boarded.filter(function (g) { return localBest(g) !== null; }).length;
  var streak = wordStepsStreak();

  var parts = [];
  parts.push(
    played === 0
      ? "Finish anything at all and it lands here."
      : "A best on " + played + " of the " + boarded.length + " cabinets that keep score.",
  );
  if (streak > 0) {
    parts.push("Word Steps streak: " + streak + (streak === 1 ? " day." : " days."));
  }
  meta.textContent = parts.join(" ");
}

/**
 * The roll: who holds each record, and what they scored.
 *
 * One request for every board at once. A row whose game has no record keeps its
 * dash and its "Unsigned", both of which were already the right size — this is
 * the whole reason the panel is emitted full and filled in afterwards.
 */
async function renderRoll() {
  var rows = await fetchAllBests();
  if (!rows) return;

  var today = localDay();
  var byGame = Object.create(null);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    // A daily game files its record under the date; everything else under "all".
    if (row.period === "all" || row.period === today) byGame[row.game_slug] = row;
  }

  for (var g = 0; g < boarded.length; g++) {
    var game = boarded[g];
    var record = byGame[game.slug];
    var el = document.querySelector('.roll-row[data-slug="' + game.slug + '"]');
    if (!el || !record) continue;

    var shown = formatScore(Number(record.best_score), game.scoreFormat);
    if (shown) el.querySelector("[data-score]").textContent = shown;

    /* The signature line has read "Unsigned" at its final height since this
       page was built, so that the day names arrived nothing would move. A
       holder who never named themselves still reads Unsigned, which is true. */
    var holder = record.players && record.players.name;
    var sig = el.querySelector("[data-sig]");
    if (sig && holder) sig.textContent = holder;
  }
}

initThemeToggle(document.getElementById("themeBtn"));
renderBests();
renderPlayer();
renderRoll();
