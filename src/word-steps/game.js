import * as DATA from "./data.js";
import { localDay, renderGlobalBest } from "../shared/ui/leaderboard.js";
import { initHowto, initShare, createNote, bindOverlay } from "../shared/ui/shell.js";
import { tone as playTone, toggle as toggleSound, onChange as onSoundChange } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { get as getPref, set as setPref } from "../shared/ui/prefs.js";

(function () {
  "use strict";

  var PUZZLES = DATA.PUZZLES;

  /* The word list is fetched as its own chunk, requested here at load rather
     than on first use. Off the critical path, but not deferred until it is
     needed: it is in flight while the board renders, so it has effectively
     always arrived by the time a player has changed a letter.
     "Effectively" is not "always", so attemptCommit() waits rather than
     rejecting a real word it simply has not read yet. */
  var DICTIONARY = null;
  var dictionaryReady = import("./dictionary.js").then(function (mod) {
    var set = Object.create(null);
    for (var i = 0; i < mod.DICTIONARY.length; i++) set[mod.DICTIONARY[i]] = true;
    DICTIONARY = set;
    return set;
  });

  var STORAGE_KEY = "word-steps.state";

  // ---------- daily puzzle selection ----------
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function getDayIndex() {
    var launch = startOfDay(new Date(DATA.LAUNCH_DATE + "T00:00:00"));
    var today = startOfDay(new Date());
    var days = Math.round((today - launch) / 86400000);
    return ((days % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  }

  function msUntilMidnight() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next - now;
  }

  var dayIndex = getDayIndex();
  var puzzle = PUZZLES[dayIndex];
  var START = puzzle.s;
  var TARGET = puzzle.t;

  // ---------- state ----------
  var state = loadState();

  function freshState() {
    return { day: dayIndex, history: [START], solved: false, bestSteps: null, solvedSteps: null };
  }

  function loadState() {
    try {
      var raw = getPref(STORAGE_KEY, null);
      if (!raw) return freshState();
      var saved = JSON.parse(raw);
      if (!saved || saved.day !== dayIndex || !Array.isArray(saved.history) || !saved.history.length) {
        return freshState();
      }
      return saved;
    } catch (e) {
      return freshState();
    }
  }

  function persist() {
    setPref(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- dom ----------
  var startWordEl = document.getElementById("startWord");
  var targetWordEl = document.getElementById("targetWord");
  var stepPill = document.getElementById("stepPill");
  var ladderWrap = document.getElementById("ladderWrap");
  var ladder = document.getElementById("ladder");
  var hintMsg = document.getElementById("hintMsg");
  var undoBtn = document.getElementById("undoBtn");
  var restartBtn = document.getElementById("restartBtn");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var soundBtn = document.getElementById("soundBtn");
  var themeBtn = document.getElementById("themeBtn");
  var letterBackdrop = document.getElementById("letterBackdrop");
  var letterSheet = document.getElementById("letterSheet");
  var letterGrid = document.getElementById("letterGrid");
  var letterCloseBtn = document.getElementById("letterCloseBtn");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlaySub = document.getElementById("overlaySub");
  var overlaySteps = document.getElementById("overlaySteps");
  var overlayBest = document.getElementById("overlayBest");
  var globalBest = document.getElementById("globalBest");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var countdownEl = document.getElementById("countdown");

  startWordEl.textContent = START;
  targetWordEl.textContent = TARGET;

  var hintTimer = null;
  function showHint(msg) {
    hintMsg.textContent = msg;
    hintMsg.classList.add("show");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintMsg.classList.remove("show"); }, 1600);
  }

  // ---------- tiny procedural audio, no assets ----------
  // ---------- audio ----------
  // This game's tone() never took a waveform — every note is a sine — so its
  // call sites read tone(freq, dur, gain, delay). Adapting here keeps those
  // call sites untouched rather than rewriting a dozen of them.
  function tone(freq, dur, gain, delay) {
    playTone(freq, dur, "sine", gain, delay);
  }

  function sndStep() { tone(520, 0.09, 0.04); }
  function sndError() { tone(160, 0.14, 0.05); }
  function sndWin() {
    tone(440, 0.14, 0.05, 0);
    tone(587, 0.14, 0.05, 0.09);
    tone(740, 0.22, 0.05, 0.18);
  }

  // ---------- helpers ----------
  function diffCount(a, b) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (a[i] !== b[i]) n++;
    return n;
  }

  function diffIndex(a, b) {
    for (var i = 0; i < 4; i++) if (a[i] !== b[i]) return i;
    return -1;
  }

  function stepLabel(n) {
    return n + (n === 1 ? " step" : " steps");
  }

  // ---------- rendering ----------
  function buildCard(word, changedAt) {
    var card = document.createElement("div");
    card.className = "step-card";
    for (var i = 0; i < word.length; i++) {
      var tile = document.createElement("span");
      tile.className = "tile" + (i === changedAt ? " changed" : "");
      tile.textContent = word[i];
      card.appendChild(tile);
    }
    return card;
  }

  function buildArrow() {
    var a = document.createElement("div");
    a.className = "step-arrow";
    a.innerHTML = "&#8595;";
    return a;
  }

  var activeTiles = null;
  /* The word the player is currently editing.
   *
   * This used to exist only as text nodes: attemptCommit() rebuilt it with
   * tiles.map(t => t.textContent), the picker read the "current" letter back
   * out of the tile it was about to change, and revert wrote the old letters
   * back into the DOM. The tiles were the state, and every one of those reads
   * turned a rendering detail into game logic — a change to how a letter is
   * displayed would have silently changed which words the game accepts.
   *
   * `draft` is now the state; the tiles render it. */
  var draft = [];

  /* The draft always starts as a copy of the newest committed word — that is
     what the active row shows before the player touches anything. */
  function setDraft(word) {
    draft = String(word).split("");
  }
  var hasEditedOnce = false;

  function render() {
    ladder.innerHTML = "";
    var history = state.history;
    // the current word is edited in place via the active tile row, so it
    // isn't also drawn as a static card — only earlier, already-locked-in
    // steps get one (all of them, once solved, since there's no active row).
    var staticCount = state.solved ? history.length : history.length - 1;

    for (var i = 0; i < staticCount; i++) {
      if (i > 0) ladder.appendChild(buildArrow());
      var changedAt = i > 0 ? diffIndex(history[i], history[i - 1]) : -1;
      ladder.appendChild(buildCard(history[i], changedAt));
    }

    activeTiles = null;
    if (!state.solved) {
      if (staticCount > 0) ladder.appendChild(buildArrow());
      ladder.appendChild(buildActiveRow());
    }

    stepPill.textContent = stepLabel(history.length - 1);

    var locked = state.solved;
    undoBtn.classList.toggle("disabled", locked || history.length <= 1);
    restartBtn.classList.toggle("disabled", locked || history.length <= 1);

    pinLadder();
  }

  // One read of scrollHeight, used for both the pin-to-newest-step and the
  // edge fade, so the fade is only paid for on a ladder long enough to need
  // it (see .ladder-wrap.is-scrollable).
  function pinLadder() {
    var overflows = ladderWrap.scrollHeight > ladderWrap.clientHeight + 1;
    ladderWrap.classList.toggle("is-scrollable", overflows);
    if (overflows) ladderWrap.scrollTop = ladderWrap.scrollHeight;
  }

  // Tap a letter tile to open a picker sheet; choosing a letter there fills
  // the tile and — if that one change makes a real word — locks it in as
  // the next step automatically. No keyboard involved, so it behaves the
  // same on every device.
  function buildActiveRow() {
    var row = document.createElement("div");
    row.className = "step-row active-row";
    var prevWord = state.history[state.history.length - 1];
    setDraft(prevWord);
    var tiles = [];

    for (var i = 0; i < 4; i++) {
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile tile-active";
      tile.textContent = draft[i];
      tile.setAttribute("aria-label", "Change letter " + (i + 1) + ", currently " + draft[i]);
      if (!hasEditedOnce && state.history.length === 1) {
        tile.classList.add("hint-bounce");
        tile.style.animationDelay = (i * 0.12) + "s";
      }
      row.appendChild(tile);
      tiles.push(tile);
    }

    tiles.forEach(function (tile, idx) {
      tile.addEventListener("click", function () {
        if (!hasEditedOnce) {
          hasEditedOnce = true;
          tiles.forEach(function (t) { t.classList.remove("hint-bounce"); });
        }
        openLetterPicker(tile, idx);
      });
    });

    activeTiles = tiles;
    return row;
  }

  // ---------- letter picker sheet ----------
  var pickerTile = null;
  var pickerIndex = -1;

  // Laid out as a phone keyboard rather than A-Z: players already know where
  // each letter sits on QWERTY, so the one they want is findable without
  // reading every key.
  var KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  (function buildLetterGrid() {
    KEY_ROWS.forEach(function (row) {
      var rowEl = document.createElement("div");
      rowEl.className = "letter-row";
      row.split("").forEach(function (letter) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "letter-btn";
        btn.textContent = letter;
        btn.addEventListener("click", function () {
          if (btn.classList.contains("current")) { closeLetterPicker(); return; }
          pickLetter(letter);
        });
        rowEl.appendChild(btn);
      });
      letterGrid.appendChild(rowEl);
    });
  })();

  function openLetterPicker(tile, index) {
    if (activeTiles) activeTiles.forEach(function (t) { t.classList.remove("picking"); });
    tile.classList.add("picking");
    pickerTile = tile;
    pickerIndex = index;
    var current = draft[index];
    var buttons = letterGrid.querySelectorAll(".letter-btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("current", buttons[i].textContent === current);
    }
    letterSheet.classList.add("show");
    letterBackdrop.classList.add("show");
    liftAboveSheet(tile);
  }

  // The sheet is fixed to the bottom of the viewport and covers the foot of the
  // ladder, so on a long ladder the row being edited ends up behind it — the
  // player picks a letter for a word they cannot see. Reserve the covered strip
  // inside the scroller and scroll by exactly the overlap, which leaves the row
  // SHEET_GAP above the sheet. A ladder that already clears the sheet is left
  // alone, so the common early-game tap costs one rect read and nothing else.
  var SHEET_GAP = 12;

  function liftAboveSheet(tile) {
    var sheetTop = window.innerHeight - letterSheet.offsetHeight;
    // The tile shares the active row's bottom edge.
    var overlap = tile.getBoundingClientRect().bottom - sheetTop + SHEET_GAP;
    if (overlap <= 0) return;
    var strip = ladderWrap.getBoundingClientRect().bottom - sheetTop + SHEET_GAP;
    // Padding at the foot extends the scroll range without moving the content,
    // and the strip is always at least the overlap, so the scroll below cannot
    // be clamped short of clearing the sheet.
    ladder.style.setProperty("--sheet-inset", Math.ceil(strip) + "px");
    ladderWrap.classList.add("is-scrollable");
    ladderWrap.scrollTop += Math.ceil(overlap);
  }

  function closeLetterPicker() {
    letterSheet.classList.remove("show");
    letterBackdrop.classList.remove("show");
    if (pickerTile) pickerTile.classList.remove("picking");
    pickerTile = null;
    pickerIndex = -1;
    if (ladder.style.getPropertyValue("--sheet-inset")) {
      // Dropping the reserved strip lets the browser clamp scrollTop back;
      // pinLadder() restores the pinned-to-newest state and the fade class.
      ladder.style.removeProperty("--sheet-inset");
      pinLadder();
    }
  }

  function pickLetter(letter) {
    if (!pickerTile || pickerIndex < 0) return;
    var changed = draft[pickerIndex] !== letter;
    draft[pickerIndex] = letter;
    pickerTile.textContent = letter;
    pickerTile.setAttribute("aria-label", "Change letter " + (pickerIndex + 1) + ", currently " + letter);
    closeLetterPicker();
    if (changed) attemptCommit();
  }

  // ---------- game actions ----------
  var revertTimer = null;

  function revertTiles(tiles, prev) {
    if (revertTimer) clearTimeout(revertTimer);
    revertTimer = setTimeout(function () {
      setDraft(prev);
      tiles.forEach(function (t, i) {
        t.textContent = draft[i];
        t.setAttribute("aria-label", "Change letter " + (i + 1) + ", currently " + draft[i]);
      });
      revertTimer = null;
    }, 450);
  }

  function attemptCommit() {
    if (state.solved || !activeTiles) return;
    if (!DICTIONARY) {
      // Beat the dictionary to the punch. Re-run once it lands rather than
      // judging the word against an empty list.
      dictionaryReady.then(attemptCommit);
      return;
    }
    var tiles = activeTiles;
    var word = draft.join("");

    var prev = state.history[state.history.length - 1];
    if (word === prev) { hideHintNow(); return; }
    if (diffCount(word, prev) !== 1) { showHint("Change exactly one letter"); sndError(); revertTiles(tiles, prev); return; }
    if (state.history.indexOf(word) !== -1) { showHint("Already used that word"); sndError(); revertTiles(tiles, prev); return; }
    if (!DICTIONARY[word]) { showHint("Not a word we know"); sndError(); revertTiles(tiles, prev); return; }

    if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
    hideHintNow();
    state.history.push(word);

    if (word === TARGET) {
      var steps = state.history.length - 1;
      state.solved = true;
      state.solvedSteps = steps;
      state.bestSteps = (state.bestSteps === null) ? steps : Math.min(state.bestSteps, steps);
      persist();
      render();
      sndWin();
      setTimeout(showOverlay, 250);
    } else {
      persist();
      render();
      sndStep();
    }
  }

  function hideHintNow() {
    if (hintTimer) clearTimeout(hintTimer);
    hintMsg.classList.remove("show");
  }

  function undo() {
    if (state.solved || state.history.length <= 1) return;
    closeLetterPicker();
    state.history.pop();
    persist();
    render();
  }

  function restart() {
    if (state.solved || state.history.length <= 1) return;
    closeLetterPicker();
    state.history = [START];
    persist();
    render();
  }

  function tryAgain() {
    closeLetterPicker();
    hideOverlay();
    state.history = [START];
    state.solved = false;
    persist();
    render();
  }

  // ---------- overlay ----------
  var countdownTimer = null;

  function tickCountdown() {
    var ms = msUntilMidnight();
    if (ms <= 0) { location.reload(); return; }
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    countdownEl.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
  }

  // Fewest steps for TODAY's puzzle. The day is sent from the player's local
  // date because that is what chose the puzzle; the server picks its own day in
  // UTC and would otherwise file a late-night score against a different puzzle.
  function showGlobalBest(steps) {
    renderGlobalBest(globalBest, {
      slug: "word-steps",
      score: steps,
      day: localDay(),
      isRecord: function (score, best) { return score <= best; },
      label: function (best) { return "Best today, worldwide: " + stepLabel(best); },
      recordLabel: "\u2605 Best today, worldwide \u2605",
      pending: "Global best \u2026",
      unavailable: "Global best unavailable",
    });
  }

  function showOverlay() {
    var steps = state.solvedSteps;
    var perfect = steps === puzzle.b;
    overlayTitle.textContent = perfect ? "PERFECT" : "SOLVED";
    overlaySub.textContent = START + " → " + TARGET;
    overlaySteps.textContent = "You did it in " + stepLabel(steps) + ".";
    if (perfect) {
      overlayBest.textContent = "★ Perfect — that's the shortest possible path!";
    } else {
      overlayBest.textContent = "★ Best today: " + stepLabel(state.bestSteps);
    }
    showGlobalBest(steps);
    shareNote.classList.remove("show");
    overlay.classList.add("show");
    tickCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdown, 1000);
  }

  function hideOverlay() {
    overlay.classList.remove("show");
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  // ---------- share ----------
  function shareResult() {
    var steps = state.solvedSteps;
    var lines = [
      "Word Steps #" + (dayIndex + 1) + " — " + START + " → " + TARGET,
      "Solved in " + stepLabel(steps) + " (best today: " + stepLabel(state.bestSteps) + ")",
      "https://www.tapwhenbored.com/word-steps/"
    ];
    var text = lines.join("\n");

    if (navigator.share) {
      navigator.share({ title: "Word Steps", text: text }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        note.show("Link copied");
      }).catch(function () {});
    }
  }

  // ---------- how to play ----------
  // ---------- wiring ----------
  undoBtn.addEventListener("click", undo);
  restartBtn.addEventListener("click", restart);
  againBtn.addEventListener("click", tryAgain);
  var note = createNote(shareNote);

  bindOverlay(overlay, {
    primary: againBtn,
    inertRoot: document.querySelector(".stage"),
    label: "Puzzle solved",
  });

  initThemeToggle(themeBtn);

  onSoundChange(function (on) {
    soundBtn.classList.toggle("is-off", !on);
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
  });
  soundBtn.addEventListener("click", function () {
    if (toggleSound()) sndStep();
  });

  shareBtn.addEventListener("click", shareResult);
  initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });
  letterBackdrop.addEventListener("click", closeLetterPicker);
  letterCloseBtn.addEventListener("click", closeLetterPicker);

  // The puzzle is chosen once, at load. A tab left open past midnight kept
  // serving yesterday's word — and because loadState() invalidates on
  // `saved.day !== dayIndex`, the stale board would then also refuse to load
  // the state it had just written.
  //
  // The solved end card already handles this: its countdown calls
  // location.reload() when it reaches zero. This is the same fix for the case
  // that had none — an *unsolved* board, where no countdown is running. A
  // reload rather than an in-place swap for exactly that reason: one rollover
  // path, already proven, rather than a second one that has to reassign the
  // puzzle constants that the rest of the file closes over.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (getDayIndex() !== dayIndex) location.reload();
  });

  render();
  if (state.solved) setTimeout(showOverlay, 50);
})();
