/* The wall.
 *
 * One row per game, each showing the best anyone has managed. The rows are in
 * the HTML already — this only writes the number and the date into them.
 *
 * The page is complete without this file: every row still names its game, its
 * unit and which direction wins, and links to play. What script adds is the
 * record itself, and if the leaderboard is unreachable the dashes simply stay.
 * That is the degraded state and it is allowed to be the normal one
 * (ARCHITECTURE.md §26, §27) — a missing number is not an error worth showing
 * anybody.
 */

import { games } from "../data/games.js";
import { fetchAllBests, localDay } from "../shared/ui/leaderboard.js";
import { formatScore, formatWhen } from "../shared/ui/format.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";

var board = document.getElementById("board");

async function renderBoard() {
  if (!board) return;

  var rows = await fetchAllBests();
  if (!rows) return;

  var today = localDay();
  var byGame = Object.create(null);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    /* A daily game files its record under the date, everything else under
       "all". Asking for both and picking here is what lets one request serve
       every game. */
    if (row.period === "all" || row.period === today) byGame[row.game_slug] = row;
  }

  var items = board.querySelectorAll(".wrow");
  for (var n = 0; n < items.length; n++) {
    var item = items[n];
    var slug = item.dataset.slug;
    var game = games.find(function (g) { return g.slug === slug; });
    var record = game && byGame[game.slug];
    if (!game || !record) continue;

    var shown = formatScore(Number(record.best_score), game.scoreFormat);
    if (!shown) continue;

    item.querySelector("[data-score]").textContent = shown;

    var when = item.querySelector("[data-when]");
    if (when) when.textContent = formatWhen(record.updated_at);
  }
}

initThemeToggle(document.getElementById("themeBtn"));
renderBoard();

/* A record can fall while the tab is in the background, and word-steps' board
   is a new one after midnight. Asking again on return costs one request. */
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) renderBoard();
});
