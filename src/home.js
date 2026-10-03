/* The homepage's only JavaScript.
 *
 * Everything here is progressive enhancement, and that is a hard rule rather
 * than a preference: the shelf and the intro are indexable content and
 * ARCHITECTURE.md §28 requires them to be static in the built HTML. This file
 * fills in a page that is already complete without it: the theme toggle, your
 * name and today's box, your best on each cabinet, the roll's numbers, and the
 * "you were a guest" line after a party.
 *
 * If it fails to load, fails to run, or the network is gone, the page is a
 * shelf of cabinets whose meta lines read "not played yet" and a roll of
 * dashes. That is the degraded state, and it is an honest one: nothing claims
 * a number it does not have.
 */

import { games } from "./data/games.js";
import { localBest, playedToday, wordStepsStreak } from "./shared/ui/progress.js";
import { signature } from "./shared/ui/player.js";
import { initToggle as initThemeToggle } from "./shared/ui/theme.js";
import { fetchAllBests } from "./shared/ui/leaderboard.js";
import { formatScore } from "./shared/ui/format.js";
import { getJSON } from "./shared/ui/prefs.js";

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
 * Today's box, and the strip saying which cabinets are in it.
 *
 * Local, like the rest of the card: "finished today" is a per-game record in
 * this browser and never leaves it (§27). A cabinet's colour comes off the
 * registry onto the pip, which is the same thing the build does to every card
 * and account row — the alternative is eight colours hardcoded in a stylesheet
 * that nothing validates.
 */
function renderBox() {
  var box = document.getElementById("p1Box");
  var pips = document.getElementById("p1Pips");
  if (!box || !pips) return;

  var got = games.filter(function (g) { return playedToday(g.slug) !== null; });

  document.getElementById("p1BoxN").textContent = String(got.length);
  box.classList.toggle("stkbox--empty", got.length === 0);
  box.classList.toggle("stkbox--full", got.length === games.length);
  document.getElementById("p1BoxFull").hidden = got.length !== games.length;

  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    var on = playedToday(game.slug) !== null;
    var pip = document.createElement("span");
    pip.className = on ? "stkpip stkpip--on" : "stkpip";
    pip.style.setProperty("--accent", game.accent);
    pip.style.setProperty("--accent-d", game.accentDark);
    /* The strip is eight identical squares, so each has to say which cabinet it
       is and whether it is filled. Colour alone says neither out loud. */
    pip.setAttribute("role", "img");
    pip.setAttribute("aria-label", game.title + (on ? " — played today" : " — not today"));
    pips.appendChild(pip);
  }
}

/**
 * The roll: who holds each record, and what they scored.
 *
 * One request for every board at once. A row whose game has no record keeps its
 * dash and its "Unsigned", both of which were already the right size — this is
 * the whole reason the panel is emitted full and filled in afterwards.
 *
 * Every row is the best anyone has ever managed: `fetchAllBests()` returns
 * exactly one all-time row per game, daily games included.
 */
async function renderRoll() {
  var rows = await fetchAllBests();
  if (!rows) return;

  var byGame = Object.create(null);
  for (var i = 0; i < rows.length; i++) byGame[rows[i].game_slug] = rows[i];

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

/**
 * The guest line, after a Tap Party: "You played at Aman's party. You
 * came 4th. Host one — it takes a minute." Written by the party page on a
 * guest's phone only, and shown for fourteen days — the window the
 * guest-to-host measure uses. Local, like the rest of the page's personal state.
 */
var GUEST_DAYS = 14;
function renderGuestLine() {
  var guest = getJSON("party.guest", null);
  var line = document.getElementById("guestLine");
  if (!line || !guest || typeof guest.host !== "string") return;
  if (!(Date.now() - guest.at < GUEST_DAYS * 24 * 60 * 60 * 1000)) return;
  document.getElementById("guestLineH").textContent = "You played at " + guest.host + "\u2019s party.";
  document.getElementById("guestLineP").textContent =
    (guest.place > 0 ? "You came " + ordinal(guest.place) + ". " : "") + "Host one \u2014 it takes a minute.";
  line.hidden = false;
}

function ordinal(n) {
  var s = ["th", "st", "nd", "rd"];
  var v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

initThemeToggle(document.getElementById("themeBtn"));
renderGuestLine();
renderBests();
renderPlayer();
renderBox();
renderRoll();
