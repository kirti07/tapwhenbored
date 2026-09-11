/* The arcade: eight cabinets, three boards each.
 *
 * The page is complete before this file runs. Every cabinet tab names its game
 * and says whether it keeps a board, the panel carries all five of its states
 * at full height, and the honesty line is already there. What script adds is
 * the scores — and if it never loads, or the network is gone, the boards stay
 * as dashes and an empty table. That is the degraded state and it is allowed
 * to be the normal one (ARCHITECTURE.md §26, §27).
 *
 * Two tablists, and both are operable from the keyboard. The mockups this is
 * built from declared `role="tablist"` and implemented no key handling at all,
 * which promises a screen-reader user behaviour that then is not there.
 */

import { games } from "../data/games.js";
import { fetchBoard, fetchStanding, fetchAllBests } from "../shared/ui/leaderboard.js";
import { localDay } from "../shared/ui/day.js";
import { identity } from "../shared/ui/player.js";
import { showState } from "../shared/ui/slot.js";
import { formatScore } from "../shared/ui/format.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";

var bySlug = Object.create(null);
for (var i = 0; i < games.length; i++) bySlug[games[i].slug] = games[i];

var cabrow = document.getElementById("cabrow");
var timeTabs = document.getElementById("timeTabs");
var slot = document.getElementById("stateSlot");
var body = document.getElementById("boardBody");
var live = document.getElementById("live");

var cabTitle = document.getElementById("cabTitle");
var cabUnit = document.getElementById("cabUnit");
var cabPlay = document.getElementById("cabPlay");
var scoreHead = document.getElementById("scoreHead");
var noboardMsg = document.getElementById("noboardMsg");

var stand = document.getElementById("stand");
var standWho = document.getElementById("standWho");
var standLbl = document.getElementById("standLbl");
var standVal = document.getElementById("standVal");

/* Why these two games have no board, in their own words. The reason belongs on
   the page rather than in a shrug: a missing board looks like an oversight. */
var NO_BOARD = {
  untangle:
    "Untangle draws a different puzzle every run, so ranking runs against each other would only tell you who got the easy layout.",
  "doodle-on": "Doodle On has no score by design — the thing you make is the result.",
};

var current = games[0].slug;
var window_ = "day";
/* Bumped on every switch. A board that arrives after the player has moved on
   belongs to a question nobody is asking any more. */
var request = 0;

// ---------- rendering ----------

function medal(rank) {
  if (rank > 3) return '<span class="arc-rkn">' + rank + "</span>";
  return '<span class="arc-medal arc-m' + rank + '">' + rank + "</span>";
}

/** Text, never innerHTML: a name is whatever somebody typed. */
function cell(text, className) {
  var td = document.createElement("td");
  td.className = className;
  td.textContent = text;
  return td;
}

function renderRows(rows, game, mine) {
  body.textContent = "";

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var tr = document.createElement("tr");
    var isMine = row.player_id === mine;
    if (isMine) tr.className = "arc-you";

    var rk = document.createElement("td");
    rk.className = "arc-rk";
    rk.innerHTML = medal(i + 1);
    tr.appendChild(rk);

    var name = row.players && row.players.name ? row.players.name : "";
    var nm = document.createElement("td");
    nm.className = "arc-nm";
    if (name) {
      nm.textContent = name;
    } else {
      // An unnamed row is a real state: the score is written before the name.
      var dim = document.createElement("span");
      dim.className = "arc-dimname";
      dim.textContent = "no name yet";
      nm.appendChild(dim);
    }
    if (isMine) {
      var chip = document.createElement("span");
      chip.className = "arc-youchip";
      chip.textContent = "you";
      nm.appendChild(chip);
    }
    tr.appendChild(nm);

    tr.appendChild(cell(formatScore(row.best_score, game.scoreFormat), "arc-sc"));
    body.appendChild(tr);
  }
}

function renderStanding(standing, game) {
  var have = standing && typeof standing.rank === "number";
  stand.classList.toggle("arc-stand--none", !have);

  if (!have) {
    var total = standing && typeof standing.total === "number" ? standing.total : 0;
    standWho.textContent = "Not on this board";
    standLbl.textContent = total
      ? "Finish a run and your row appears here."
      : "Nobody is on it yet.";
    standVal.textContent = "—";
    return;
  }

  standWho.textContent = ordinal(standing.rank) + " of " + standing.total;
  standLbl.textContent =
    typeof standing.above === "number"
      ? formatScore(standing.above, game.scoreFormat) + " is one place ahead"
      : "Nobody is ahead of you.";
  standVal.textContent = formatScore(standing.your_best, game.scoreFormat);
}

function ordinal(n) {
  var rest = n % 100;
  if (rest >= 11 && rest <= 13) return n + "th";
  var last = n % 10;
  return n + (last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th");
}

// ---------- loading ----------

async function load() {
  var game = bySlug[current];
  var mine = request + 1;
  request = mine;

  cabTitle.textContent = game.title;
  /* Above the no-board return below, deliberately: untangle and doodle-on keep
     no scores and are entirely playable. The title goes in the label as well
     as the href, so "Play" is not the whole of what a screen reader hears once
     the bar is too narrow for the word. */
  cabPlay.href = game.path;
  cabPlay.setAttribute("aria-label", "Play " + game.title);

  if (game.leaderboard === false) {
    cabUnit.textContent = "no board";
    noboardMsg.textContent = NO_BOARD[game.slug] || "";
    timeTabs.hidden = true;
    showState(slot, "noboard");
    return;
  }

  timeTabs.hidden = false;
  cabUnit.textContent =
    game.scoreUnit + " · " + (game.leaderboard.lowerIsBetter ? "lower is better" : "higher is better");
  scoreHead.textContent = game.scoreUnit;

  showState(slot, "loading");

  var day = localDay();
  var results = await Promise.all([
    fetchBoard({
      slug: game.slug,
      period: window_,
      day: day,
      lowerIsBetter: game.leaderboard.lowerIsBetter,
      limit: 10,
    }),
    fetchStanding({ slug: game.slug, period: window_, day: day }),
  ]);

  if (request !== mine) return; // the player has moved on

  var rows = results[0];
  if (rows === null) {
    showState(slot, "error");
    return;
  }
  if (!rows.length) {
    showState(slot, "empty");
    return;
  }

  renderRows(rows, game, identity().id);
  renderStanding(results[1], game);
  showState(slot, "board");
  live.textContent = game.title + ", " + windowLabel() + ": " + rows.length + " on the board.";
}

function windowLabel() {
  return window_ === "day" ? "today" : window_ === "week" ? "this week" : "all time";
}

// ---------- the tab strips ----------

/**
 * Arrow keys, Home and End across a tablist, with a roving tabindex.
 *
 * One handler for both strips because the behaviour is identical and the
 * pattern is not optional: `role="tablist"` tells a screen reader the arrows
 * work, so they have to.
 */
function bindTablist(container, select) {
  var tabs = function () {
    return Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
  };

  container.addEventListener("click", function (event) {
    var tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });

  container.addEventListener("keydown", function (event) {
    var list = tabs();
    var at = list.indexOf(document.activeElement);
    if (at < 0) return;

    var next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (at + 1) % list.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    if (next < 0) return;

    event.preventDefault();
    list[next].focus();
    select(list[next]);
  });
}

function mark(container, chosen) {
  var list = container.querySelectorAll('[role="tab"]');
  for (var i = 0; i < list.length; i++) {
    var on = list[i] === chosen;
    list[i].setAttribute("aria-selected", String(on));
    list[i].tabIndex = on ? 0 : -1;
  }
}

function selectCabinet(tab) {
  if (!tab.dataset.slug || tab.dataset.slug === current) return;
  current = tab.dataset.slug;
  mark(cabrow, tab);
  // The panel is labelled by whichever tab owns it.
  document.getElementById("cabinet").setAttribute("aria-labelledby", tab.id);
  load();
}

function selectWindow(tab) {
  if (!tab.dataset.window || tab.dataset.window === window_) return;
  window_ = tab.dataset.window;
  mark(timeTabs, tab);
  load();
}

// ---------- the tabs' own numbers ----------

/**
 * Each cabinet's record, from the one request the homepage already makes. A tab
 * with no number keeps its dash.
 *
 * The tab says "All-time best" and this is the all-time record, which took some
 * getting to. It used to be labelled "Today's best" and filled from the same
 * `game_scores` read — where, for the five games that are not daily, the only
 * row is `period='all'`. So the number under "Today's best" was the all-time
 * record for six of the eight cabinets, and matched the panel's *All-time*
 * board rather than the Today one directly beneath the label.
 *
 * The number is the record; the board below is the top ten named players. Those
 * are the same thing whenever the record holder has a name — which, now that a
 * run carries one, is from here on.
 */
async function fillTabs() {
  var rows = await fetchAllBests();
  if (!rows) return;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var game = bySlug[row.game_slug];
    var tab = game && document.getElementById("cab-" + game.slug);
    if (!tab) continue;
    var value = tab.querySelector("[data-top]");
    if (value) value.textContent = formatScore(row.best_score, game.scoreFormat);

    var holder = row.players && row.players.name;
    var who = tab.querySelector("[data-holder]");
    if (who && holder) who.textContent = holder;
  }
}

// ---------- go ----------

initThemeToggle(document.getElementById("themeBtn"));
bindTablist(cabrow, selectCabinet);
bindTablist(timeTabs, selectWindow);
document.getElementById("retry").addEventListener("click", load);

load();
fillTabs();
