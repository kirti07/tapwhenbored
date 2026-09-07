/* The player card.
 *
 * Two halves that must not be confused, and the page says which is which.
 *
 * The local half — your name and your best on each cabinet — is held in this
 * browser and is complete without any network at all. The remote half is one
 * column: your rank. A board that cannot be reached costs you the rank column
 * and nothing else, which is why the empty state there is an empty cell rather
 * than an error (ARCHITECTURE.md §27).
 *
 * The page is whole before this file runs: every row is emitted from the
 * registry, the name reads "Unsigned", and the ranks are blank.
 */

import { games } from "../data/games.js";
import { localBest, wordStepsStreak } from "../shared/ui/progress.js";
import { getName, setName, clean, UNSIGNED } from "../shared/ui/player.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { formatScore } from "../shared/ui/format.js";
import { showState } from "../shared/ui/slot.js";
import { fetchStanding, savePlayer, deletePlayer } from "../shared/ui/leaderboard.js";

var body = document.getElementById("bestsBody");
var nameSlot = document.getElementById("nameSlot");
var nameOut = document.getElementById("nameOut");
var youMeta = document.getElementById("youMeta");

var boarded = games.filter(function (g) { return g.leaderboard !== false; });

// ---------- the local half ----------

function renderBests() {
  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    var row = body.querySelector('[data-slot="' + game.slug + '"]');
    if (!row) continue;

    var best = localBest(game);
    var cell = row.querySelector("[data-score]");
    // An em dash, not a zero: no best is not a best of nothing.
    cell.textContent = best === null ? "—" : formatScore(best, game.scoreFormat);
  }
}

function renderName() {
  nameOut.textContent = getName() || UNSIGNED;
}

/**
 * The one line under the name.
 *
 * Counts only what this browser can answer for on its own — how many boards it
 * has a best on — plus the streak, which is also local. Nothing here waits on
 * the network, so the line is right on the first frame and does not change
 * under the reader when the ranks land.
 */
function renderMeta() {
  var on = boarded.filter(function (g) { return localBest(g) !== null; }).length;
  var streak = wordStepsStreak();

  var parts = [];
  parts.push(
    on === 0
      ? "Not on any board yet."
      : "A best on " + on + " of the " + boarded.length + " cabinets that keep score.",
  );
  if (streak > 0) {
    parts.push("Word Steps streak: " + streak + (streak === 1 ? " day." : " days."));
  }
  youMeta.textContent = parts.join(" ");
}

// ---------- the remote half ----------

/**
 * The rank column, one request per boarded game.
 *
 * A rank needs the board's size and the row's position, neither of which is a
 * column, so this cannot be one read (§27). They go out together and each fills
 * its own cell; a game that does not answer leaves its cell empty, which is the
 * honest thing for a page whose other column is already correct.
 */
async function renderRanks() {
  await Promise.all(
    boarded.map(async function (game) {
      var row = body.querySelector('[data-slot="' + game.slug + '"]');
      var cell = row && row.querySelector("[data-rank]");
      if (!cell) return;

      var standing = await fetchStanding({ slug: game.slug, period: "all" });
      if (!standing || typeof standing.rank !== "number") return;
      cell.textContent = "#" + standing.rank + " of " + standing.total;
    }),
  );
}

// ---------- the name editor ----------

function initNameEditor() {
  var edit = document.getElementById("editBtn");
  var input = document.getElementById("nameInp");
  var save = document.getElementById("saveBtn");
  var cancel = document.getElementById("cancelBtn");
  if (!edit || !input || !save || !cancel) return;

  function open() {
    input.value = getName();
    showState(nameSlot, "edit");
    input.focus();
    input.select();
  }

  /* Focus always comes back to the control that opened the editor. Leaving it
     on a now-inert field is how a keyboard user loses their place. */
  function close() {
    showState(nameSlot, "view");
    edit.focus();
  }

  function commit() {
    setName(input.value);
    renderName();
    renderMeta();
    close();
  }

  edit.addEventListener("click", open);
  save.addEventListener("click", commit);
  cancel.addEventListener("click", close);

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); commit(); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
  });

  // Show what will actually be saved rather than changing it underneath them.
  input.addEventListener("input", function () {
    var cleaned = clean(input.value);
    if (cleaned !== input.value) input.value = cleaned;
  });
}

// ---------- the optional half ----------

function initPrefs() {
  var email = document.getElementById("emailInp");
  var displaced = document.getElementById("prefDisplaced");
  var streak = document.getElementById("prefStreak");
  var save = document.getElementById("savePrefs");
  var remove = document.getElementById("deleteBtn");
  var status = document.getElementById("prefStatus");
  if (!save || !remove || !status) return;

  function say(text, bad) {
    status.textContent = text;
    status.classList.toggle("arc-status--bad", Boolean(bad));
  }

  save.addEventListener("click", async function () {
    save.disabled = true;
    say("Saving…");
    var ok = await savePlayer({
      email: email.value,
      notifyDisplaced: displaced.checked,
      notifyStreak: streak.checked,
    });
    save.disabled = false;
    if (ok) say("Saved.");
    else say(
      email.value && !email.checkValidity()
        ? "That address does not look right."
        : "Could not save. Try again in a minute.",
      true,
    );
  });

  /* Two taps, because it cannot be undone. The confirm is the browser's own: a
     bespoke dialog here would be a fourth overlay pattern for one button. */
  remove.addEventListener("click", async function () {
    if (!window.confirm("Delete your name, your email address and every board row? Your bests on this device are untouched.")) return;

    remove.disabled = true;
    say("Deleting…");
    var ok = await deletePlayer();
    remove.disabled = false;
    if (!ok) {
      say("Could not delete. Try again in a minute.", true);
      return;
    }
    // Locally too, or the page would still show a name the boards have lost.
    setName("");
    renderName();
    renderMeta();
    body.querySelectorAll("[data-rank]").forEach(function (cell) {
      if (cell.textContent.charAt(0) === "#") cell.textContent = "";
    });
    say("Deleted.");
  });
}

// ---------- start ----------

initThemeToggle(document.getElementById("themeBtn"));
initNameEditor();
initPrefs();
renderName();
renderBests();
renderMeta();
renderRanks();
