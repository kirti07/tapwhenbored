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
import { localBest, playedToday, streaks } from "../shared/ui/progress.js";
import { getName, setName, clean, UNSIGNED } from "../shared/ui/player.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { formatScore } from "../shared/ui/format.js";
import { showState } from "../shared/ui/slot.js";
import { fetchStanding, savePlayer, deletePlayer, isLeaderboardAvailable } from "../shared/ui/leaderboard.js";
import { get as getPref, set as setPref } from "../shared/ui/prefs.js";

var body = document.getElementById("bestsBody");
var nameSlot = document.getElementById("nameSlot");
var nameOut = document.getElementById("nameOut");
var nameStatus = document.getElementById("nameStatus");
var youMeta = document.getElementById("youMeta");

/* What the boards accept, mirroring players_name_shape and save_player() in
   README-supabase.sql. Only ever used to explain a refusal after the fact —
   `clean()` deliberately does not enforce it, so nothing is rewritten under
   somebody as they type. */
var BOARD_NAME = /^[A-Za-z0-9 _'-]+$/;

// One line per reason a board write can come back with (leaderboard.js write).
// Save, rename and Delete all read from here so they cannot drift apart.
var SAY = {
  busy: "Too many tries from this network. Try again in a minute.",
  offline: "You’re offline.",
  error: "Couldn’t reach the boards. Try again in a minute.",
  denied: "This browser can’t change that player: its saved key doesn’t match.",
  blocked: "This name can’t go on the boards.",
  bad_name: "That name can’t go on a board — letters, numbers, spaces, hyphen and ' only.",
  bad_email: "That address does not look right.",
};

// Whether this browser has saved an email. The boards never send it back.
var EMAIL_SAVED = "account.email";

var boarded = games.filter(function (g) { return g.leaderboard !== false; });

var bySlug = Object.create(null);
for (var gi = 0; gi < games.length; gi++) bySlug[games[gi].slug] = games[gi];

/* One sticker's shape, as a constant. Nothing is interpolated into it: the
   glyph's id goes on with setAttribute and the two bits of text with
   textContent, so a registry value can never be parsed as markup. */
var STICKER = [
  '<span class="stk-cut">',
  '<span class="stk-face" aria-hidden="true"><svg viewBox="0 0 48 48"><use/></svg></span>',
  '<span class="stk-run arc-medal" aria-hidden="true"></span>',
  "</span>",
  '<span class="stk-n"></span>',
].join("");

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
 * has a best on. Nothing here waits on the network, so the line is right on the
 * first frame and does not change under the reader when the ranks land.
 */
function renderMeta() {
  var on = boarded.filter(function (g) { return localBest(g) !== null; }).length;

  youMeta.textContent =
    on === 0
      ? "Not on any board yet."
      : "A best on " + on + " of the " + boarded.length + " cabinets that keep score.";
}

/** Today's box: how many of the eight have been played to an end state. */
function renderBox() {
  var box = document.getElementById("youBox");
  if (!box) return;

  var got = games.filter(function (g) { return playedToday(g.slug) !== null; }).length;

  document.getElementById("youBoxN").textContent = String(got);
  box.classList.toggle("stkbox--empty", got === 0);
  box.classList.toggle("stkbox--full", got === games.length);
  document.getElementById("youBoxFull").hidden = got !== games.length;
}

/**
 * The streak sheet: one sticker per cabinet with a live run, longest first.
 *
 * A cabinet with no run gets nothing rather than a zero — this is a shelf of
 * what is going well, and a wall of eight zeroes is a different, worse page.
 * Which means the sheet has two states, and an empty one is the normal state
 * for a first visit rather than an error.
 *
 * The count is on the sticker and again in its label, because a badge on a
 * glyph is not a sentence: `21` beside a hexagon tells a screen reader nothing.
 */
function renderStreaks() {
  var wall = document.getElementById("streakWall");
  var none = document.getElementById("streakNone");
  if (!wall || !none) return;

  var live = streaks(games.map(function (g) { return g.slug; }));

  wall.hidden = live.length === 0;
  none.hidden = live.length > 0;

  for (var i = 0; i < live.length; i++) {
    var game = bySlug[live[i].slug];
    var run = live[i].run;

    var item = document.createElement("li");
    item.className = "stk";
    item.style.setProperty("--accent", game.accent);
    item.style.setProperty("--accent-d", game.accentDark);
    item.innerHTML = STICKER;

    item.querySelector("use").setAttribute("href", "#" + game.sticker);
    item.querySelector(".stk-run").textContent = String(run);
    item.querySelector(".stk-n").textContent = game.title;
    item.setAttribute("aria-label", game.title + " — " + run + (run === 1 ? " day" : " days") + " in a row");
    wall.appendChild(item);
  }
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

function sayName(text, bad) {
  if (!nameStatus) return;
  nameStatus.textContent = text;
  nameStatus.classList.toggle("arc-status--bad", Boolean(bad));
}

/**
 * Send the name to the boards. Never awaited, never throws. A failure always
 * says the name is still on this device, or the player can't tell if it's lost.
 */
function pushName() {
  var name = getName();
  sayName("Saving…");

  savePlayer({ name: name }).then(function (why) {
    if (why === "ok") {
      sayName(name ? "Saved. It shows on every board you’re on." : "Name cleared.");
      return;
    }
    if (why === "unavailable") {
      sayName("Saved on this device.");
      return;
    }
    // A database without the v2 functions can't say why; infer it.
    if (why === "refused") why = name && !BOARD_NAME.test(name) ? "bad_name" : "error";
    var text = SAY[why] || SAY.error;
    if (why !== "bad_name" && why !== "blocked") text += " Your name is still on this device.";
    sayName(text, true);
  });
}

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

  /**
   * Save locally, close, then tell the board — in that order, and deliberately.
   * The board write is what puts the name on the wall.
   *
   * `pushName()` is not awaited: the editor closes on the frame they press
   * Save and the network catches up underneath. The local name is
   * authoritative, so a failed save loses nothing but the trip.
   */
  function commit() {
    setName(input.value);
    renderName();
    renderMeta();
    close();
    pushName();
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
  var section = document.getElementById("pingH");
  var email = document.getElementById("emailInp");
  var displaced = document.getElementById("prefDisplaced");
  var streak = document.getElementById("prefStreak");
  var save = document.getElementById("savePrefs");
  var removeEmail = document.getElementById("removeEmail");
  var remove = document.getElementById("deleteBtn");
  var status = document.getElementById("prefStatus");
  if (!section || !save || !removeEmail || !remove || !status) return;

  // No boards in this build: nothing here could be saved.
  if (!isLeaderboardAvailable()) {
    section.hidden = true;
    section.nextElementSibling.hidden = true;
    return;
  }

  function say(text, bad) {
    status.textContent = text;
    status.classList.toggle("arc-status--bad", Boolean(bad));
  }

  /* The boards never send the address back, so the field is always empty on a
     return visit. Say when one is saved rather than implying there is none. */
  function showEmailState() {
    var saved = getPref(EMAIL_SAVED) === "1";
    email.placeholder = saved ? "Email saved. Type to replace it." : "you@example.com";
    removeEmail.hidden = !saved;
  }
  showEmailState();

  function busy(on) {
    save.disabled = removeEmail.disabled = remove.disabled = on;
  }

  save.addEventListener("click", async function () {
    var address = email.value.trim();
    if (address && !email.checkValidity()) {
      say(SAY.bad_email, true);
      return;
    }
    busy(true);
    say("Saving…");
    // An empty field leaves a saved address alone; Remove my email clears it.
    var why = await savePlayer({
      email: address || undefined,
      notifyDisplaced: displaced.checked,
      notifyStreak: streak.checked,
    });
    busy(false);
    if (why !== "ok") {
      say(why === "refused" ? "Could not save. Try again in a minute." : SAY[why] || SAY.error, true);
      return;
    }
    if (address) setPref(EMAIL_SAVED, "1");
    email.value = "";
    showEmailState();
    var wantsMail = displaced.checked || streak.checked;
    say(wantsMail && getPref(EMAIL_SAVED) !== "1" ? "Saved. Add an email above to get these." : "Saved.");
  });

  removeEmail.addEventListener("click", async function () {
    busy(true);
    say("Removing…");
    var why = await savePlayer({ email: "" });
    busy(false);
    if (why !== "ok") {
      say(why === "refused" ? "Could not remove it. Try again in a minute." : SAY[why] || SAY.error, true);
      return;
    }
    setPref(EMAIL_SAVED, "");
    showEmailState();
    say("Email removed.");
  });

  /* Two taps, because it cannot be undone. The confirm is the browser's own: a
     bespoke dialog here would be a fourth overlay pattern for one button. */
  remove.addEventListener("click", async function () {
    if (!window.confirm("Delete your name, your email address and every board row? Your bests on this device are untouched.")) return;

    busy(true);
    say("Deleting…");
    var why = await deletePlayer();
    busy(false);
    if (why !== "ok" && why !== "not_found") {
      say(why === "refused" ? "Could not delete. Try again in a minute." : SAY[why] || SAY.error, true);
      return;
    }
    // Locally too, or the page would still show a name the boards have lost.
    setName("");
    setPref(EMAIL_SAVED, "");
    showEmailState();
    renderName();
    renderMeta();
    sayName("");
    body.querySelectorAll("[data-rank]").forEach(function (cell) {
      if (cell.textContent.charAt(0) === "#") cell.textContent = "";
    });
    say(why === "ok"
      ? "Deleted."
      : "Nothing was on the boards from this browser. Your name here is cleared.");
  });
}

// ---------- start ----------

initThemeToggle(document.getElementById("themeBtn"));
initNameEditor();
initPrefs();
renderName();
renderBests();
renderMeta();
renderBox();
renderStreaks();
renderRanks();
