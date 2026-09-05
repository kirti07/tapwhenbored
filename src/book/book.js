/* The sticker book.
 *
 * Everything on this page is local. There is no account, no upload and no
 * server call — the stickers come from what the games wrote to this browser
 * today, and the name is a label the player writes on their own work.
 *
 * The page is complete without this file: eight empty slots and an honest
 * heading. Script only fills in what the device happens to know.
 */

import { games } from "../data/games.js";
import { playedToday } from "../shared/ui/progress.js";
import { getName, setName, clean, signature, initial, UNSIGNED } from "../shared/ui/player.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { formatScore } from "../shared/ui/format.js";

var grid = document.getElementById("bookGrid");
var heading = document.getElementById("bookH");


// ---------- the slots ----------

function renderSlots() {
  var earned = 0;

  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    var slot = grid && grid.querySelector('[data-slot="' + game.slug + '"]');
    if (!slot) continue;

    var record = playedToday(game.slug);
    var scoreEl = slot.querySelector("[data-score]");
    var unitEl = slot.querySelector("[data-unit]");
    var sigEl = slot.querySelector("[data-sig]");
    var labEl = slot.querySelector("[data-lab]");
    var play = slot.querySelector(".btn");

    /* Toggled both ways round, not just on: renderSlots() runs again when the
       tab comes back, and a book left open across midnight has to give its
       stickers back. */
    var played = Boolean(record);
    slot.classList.toggle("slot--f", played);
    slot.classList.toggle("slot--e", !played);
    if (played) earned += 1;

    var shown = record ? formatScore(record.score, game.scoreFormat) : null;

    if (scoreEl) {
      scoreEl.textContent = shown || "";
      scoreEl.hidden = !shown;
    }
    /* doodle-on finishes with a drawing rather than a number, so its sticker is
       earned and its unit line stays away. */
    if (unitEl) unitEl.hidden = !shown;
    if (sigEl) {
      sigEl.textContent = signature();
      sigEl.hidden = !played;
    }
    if (labEl) {
      labEl.textContent = played && !shown ? "Played today" : "Not played today";
      labEl.hidden = played && Boolean(shown);
    }
    if (play) play.hidden = played;
  }

  if (heading) {
    heading.textContent =
      earned === 0
        ? "Nothing played yet today"
        : earned === games.length
          ? "Every sticker, today — all " + games.length + " of them"
          : earned + " of " + games.length + " played today";
  }
}

// ---------- the name ----------

function renderName() {
  var out = document.getElementById("nameOut");
  var av = document.getElementById("avatar");
  if (out) out.textContent = signature();
  if (av) av.textContent = initial();
  // Every sticker is signed with the same name.
  var sigs = document.querySelectorAll("[data-sig]");
  for (var i = 0; i < sigs.length; i++) {
    if (!sigs[i].hidden) sigs[i].textContent = signature();
  }
}

function initNameCard() {
  var view = document.getElementById("nameView");
  var edit = document.getElementById("nameEdit");
  var editBtn = document.getElementById("editBtn");
  var input = document.getElementById("nameInp");
  var save = document.getElementById("saveBtn");
  var cancel = document.getElementById("cancelBtn");
  if (!view || !edit || !editBtn || !input) return;

  function show(editing) {
    view.hidden = editing;
    editBtn.hidden = editing;
    edit.hidden = !editing;
  }

  editBtn.addEventListener("click", function () {
    input.value = getName();
    show(true);
    input.focus();
    input.select();
  });

  if (cancel) {
    cancel.addEventListener("click", function () {
      show(false);
      editBtn.focus();
    });
  }

  function commit() {
    /* Cleaned before it is stored *and* before it is shown, so the player sees
       exactly what was saved rather than something quietly different. An empty
       result clears the name, which is how you get back to Unsigned. */
    setName(input.value);
    renderName();
    show(false);
    editBtn.focus();
  }

  if (save) save.addEventListener("click", commit);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      show(false);
      editBtn.focus();
    }
  });

  // Show the trimmed form as they type, so the 16-character cap is not a
  // surprise at save time.
  input.addEventListener("input", function () {
    var trimmed = clean(input.value);
    var out = document.getElementById("nameOut");
    if (out) out.textContent = trimmed || UNSIGNED;
  });
}

// ---------- start ----------

initThemeToggle(document.getElementById("themeBtn"));
initNameCard();
renderSlots();
renderName();

/* A book left open past midnight would still show yesterday. The records
   expire on their own — playedToday() compares the stored day to today — so
   this only has to ask again. */
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) {
    renderSlots();
    renderName();
  }
});
