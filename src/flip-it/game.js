import { renderGlobalBest } from "../shared/ui/leaderboard.js";
import { initHowto, initShare, bindOverlay } from "../shared/ui/shell.js";
import { tone, initSoundToggle } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { getJSON, setJSON, get as getPref, set as setPref } from "../shared/ui/prefs.js";
import { recordPlay } from "../shared/ui/progress.js";
/* Was a local formatter that zero-padded the minutes, so a nine-second solve
   read "00:09". The site now spells a duration one way. */
import { formatDuration as formatTime } from "../shared/ui/format.js";

(function () {
  "use strict";

  // Each level spans two board sizes and a band of optimal-move counts per
  // size. Generation presses exactly k distinct tiles, so the band IS the
  // optimal-move count rather than a filter over random boards — the whole
  // point being that Easy is genuinely short, not a small grid that still
  // needs ten moves.
  var LEVELS = {
    easy:   { label: "EASY",   sizes: [4, 5], moves: { 4: [3, 4],   5: [4, 5] } },
    medium: { label: "MEDIUM", sizes: [5, 6], moves: { 5: [7, 9],   6: [8, 11] } },
    hard:   { label: "HARD",   sizes: [6, 7], moves: { 6: [14, 17], 7: [16, 20] } },
  };
  var LEVEL_ORDER = ["easy", "medium", "hard"];
  var DEFAULT_LEVEL = "easy";

  // Links shared when the picker was 5/6/7 still open on a sensible level.
  var LEGACY_SIZE_LEVEL = { "4": "easy", "5": "easy", "6": "medium", "7": "hard" };
  var GEN_ATTEMPTS = 200;
  var RECENT_MAX = 12;

  // Only Medium perfect solves reach the leaderboard. Boards are random, so a
  // plain "fewest moves" record would just log whoever drew the easiest board —
  // the reason untangle has no leaderboard at all. Requiring the run to match
  // the computed optimal removes that, and timing it keeps the record moving.
  // Mixing three levels into one record would put the problem straight back,
  // so Easy and Hard are personal-best only.
  var LB_LEVEL = "medium";

  var RIPPLE_STEP_MS = 45;
  var TICK_MS = 250;

  var BEST_KEY = "flip-it.best";     // v1 was keyed by board size, before levels
  var RECENT_KEY = "flip-it.recent";
  var LEVEL_KEY = "flip-it.level";

  var board = document.getElementById("board");
  var movesVal = document.getElementById("movesVal");
  var timeVal = document.getElementById("timeVal");
  var levels = document.getElementById("levels");
  var resetBtn = document.getElementById("resetBtn");
  var restartBtn = document.getElementById("restartBtn");
  var soundBtn = document.getElementById("soundBtn");
  var overlay = document.getElementById("overlay");
  var overlayBadge = document.getElementById("overlayBadge");
  var overlaySub = document.getElementById("overlaySub");
  var overlayTime = document.getElementById("overlayTime");
  var globalBest = document.getElementById("globalBest");
  var lbHint = document.getElementById("lbHint");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var challengeBanner = document.getElementById("challengeBanner");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var themeBtn = document.getElementById("themeBtn");

  var level = readLevel();
  var size = LEVELS[level].sizes[0]; // the dealt board decides; this is a seed
  var state = null;      // Uint8Array, 1 = lit
  var startState = null; // the board Reset returns to
  var optimal = 0;       // fewest moves this board can be solved in
  var tileEls = [];
  var moves = 0;
  var ended = false;
  var startedAt = null;  // null until the first tap — the clock starts on a move
  var finalMs = null;
  var tickHandle = null;
  var rippleHandle = null;
  var recent = readRecent();
  var bests = readBests();

  // ---------- storage (all of it optional, none of it load-bearing) ----------

  function readLevel() {
    try {
      var v = getPref(LEVEL_KEY, null);
      return LEVEL_ORDER.indexOf(v) !== -1 ? v : DEFAULT_LEVEL;
    } catch (e) { return DEFAULT_LEVEL; }
  }

  function writeLevel(v) {
    setPref(LEVEL_KEY, v);
  }

  function readRecent() {
    try {
      var v = getJSON(RECENT_KEY, null);
      return Array.isArray(v) ? v.slice(-RECENT_MAX) : [];
    } catch (e) { return []; }
  }

  function pushRecent(sig) {
    recent.push(sig);
    if (recent.length > RECENT_MAX) recent = recent.slice(-RECENT_MAX);
    setJSON(RECENT_KEY, recent);
  }

  function readBests() {
    try {
      var v = getJSON(BEST_KEY, null);
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }

  function writeBests() {
    setJSON(BEST_KEY, bests);
  }


  // ---------- audio ----------
  function sndFlip() { tone(660, 0.07, "sine", 0.05); }
  function sndUi() { tone(420, 0.05, "triangle", 0.04); }
  function sndWin() {
    tone(660, 0.12, "sine", 0.05, 0);
    tone(880, 0.12, "sine", 0.05, 0.09);
    tone(1320, 0.24, "sine", 0.05, 0.18);
  }

  // ---------- the puzzle, as linear algebra over GF(2) ----------
  //
  // Every tap is a vector over GF(2), taps commute, and tapping twice is a
  // no-op. So a solution is a SET of tiles rather than a sequence, and the
  // fewest possible moves is the minimum-weight solution of Ax = b. That is
  // why OPTIMAL on the end card is exact rather than an estimate.
  //
  // Rows are Uint8Array of 0/1 rather than bitmasks: 7x7 needs 49 bits and JS
  // bitwise operators are 32-bit. Elimination is at most 49^3 byte operations,
  // which is microseconds — cheap enough to run on every generated board.

  var matrixCache = {};

  /** matrixFor(n)[i] = the tiles that pressing tile i toggles. */
  function matrixFor(n) {
    if (matrixCache[n]) return matrixCache[n];
    var N = n * n;
    var m = [];
    for (var i = 0; i < N; i++) {
      var row = new Uint8Array(N);
      var r = (i / n) | 0;
      var c = i % n;
      row[i] = 1;
      if (r > 0) row[i - n] = 1;
      if (r < n - 1) row[i + n] = 1;
      if (c > 0) row[i - 1] = 1;
      if (c < n - 1) row[i + 1] = 1;
      m.push(row);
    }
    matrixCache[n] = m;
    return m;
  }

  /**
   * Fewest moves that clear `lit`, or null if it cannot be cleared.
   *
   * The relation is symmetric — pressing i toggles j exactly when pressing j
   * toggles i — so matrixFor(n) doubles as the coefficient matrix. 4x4 has a
   * four-dimensional null space (16 solutions) and 5x5 a two-dimensional one
   * (4 solutions); the lightest wins. 6x6 and 7x7 have exactly one each.
   */
  function solveOptimal(n, lit) {
    var N = n * n;
    var m = matrixFor(n);
    var rows = [];
    var i, j, k;

    for (i = 0; i < N; i++) {
      var row = new Uint8Array(N + 1);
      row.set(m[i]);
      row[N] = lit[i];
      rows.push(row);
    }

    var pivotCol = [];
    var rank = 0;
    for (var col = 0; col < N && rank < N; col++) {
      var p = -1;
      for (k = rank; k < N; k++) { if (rows[k][col]) { p = k; break; } }
      if (p < 0) continue;
      var swap = rows[rank]; rows[rank] = rows[p]; rows[p] = swap;
      var pivot = rows[rank];
      for (k = 0; k < N; k++) {
        if (k === rank || !rows[k][col]) continue;
        var target = rows[k];
        for (j = col; j <= N; j++) target[j] ^= pivot[j];
      }
      pivotCol.push(col);
      rank++;
    }

    // A row of all zeros with a 1 on the right is 0 = 1: unsolvable. Generation
    // makes this impossible, but the solver stays honest about it.
    for (k = rank; k < N; k++) if (rows[k][N]) return null;

    var isPivot = new Uint8Array(N);
    for (i = 0; i < pivotCol.length; i++) isPivot[pivotCol[i]] = 1;

    var base = new Uint8Array(N);
    for (i = 0; i < pivotCol.length; i++) base[pivotCol[i]] = rows[i][N];

    var basis = [];
    for (var f = 0; f < N; f++) {
      if (isPivot[f]) continue;
      var v = new Uint8Array(N);
      v[f] = 1;
      for (i = 0; i < pivotCol.length; i++) if (rows[i][f]) v[pivotCol[i]] = 1;
      basis.push(v);
    }

    // 4 free variables on 4x4, 2 on 5x5, none on 6x6 and 7x7. The cap is a
    // guard against a size that was never meant to be here, not a real case.
    var combos = basis.length <= 12 ? 1 << basis.length : 1;
    var bestWeight = -1;
    var bestSol = null;
    for (var mask = 0; mask < combos; mask++) {
      var sol = new Uint8Array(base);
      for (i = 0; i < basis.length; i++) {
        if (!(mask & (1 << i))) continue;
        var bv = basis[i];
        for (j = 0; j < N; j++) sol[j] ^= bv[j];
      }
      var w = 0;
      for (j = 0; j < N; j++) w += sol[j];
      if (bestWeight < 0 || w < bestWeight) { bestWeight = w; bestSol = sol; }
    }
    return { moves: bestWeight, solution: bestSol };
  }

  function press(n, lit, i) {
    var m = matrixFor(n)[i];
    for (var j = 0; j < lit.length; j++) lit[j] ^= m[j];
  }

  function signature(lit) {
    var s = "";
    for (var i = 0; i < lit.length; i++) s += lit[i];
    return s;
  }

  function isCleared(lit) {
    for (var i = 0; i < lit.length; i++) if (lit[i]) return false;
    return true;
  }

  /** An empty grid with k distinct random tiles pressed. */
  function pressRandomK(n, k) {
    var N = n * n;
    var lit = new Uint8Array(N);
    var idx = [];
    for (var i = 0; i < N; i++) idx.push(i);
    for (i = N - 1; i > 0; i--) {                 // Fisher-Yates, partial
      var j = (Math.random() * (i + 1)) | 0;
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    for (i = 0; i < k; i++) press(n, lit, idx[i]);
    return lit;
  }

  /**
   * A fresh board for a level, solvable by construction: pressing k distinct
   * tiles on an empty grid makes those presses a solution, so an impossible
   * puzzle cannot be produced and the optimal is k in all but a few percent of
   * draws (a shorter route can exist through the null space). The solver still
   * has the last word on `optimal`; a draw that lands under the level's floor
   * is redrawn. Boards served in the last dozen deals are rejected too.
   */
  function generate(lvl) {
    var cfg = LEVELS[lvl];
    var n = cfg.sizes[(Math.random() * cfg.sizes.length) | 0];
    var band = cfg.moves[n];
    var k = band[0] + ((Math.random() * (band[1] - band[0] + 1)) | 0);
    var fallback = null;

    for (var attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
      var lit = pressRandomK(n, k);
      if (isCleared(lit)) continue;

      var sig = signature(lit);
      if (recent.indexOf(sig) !== -1) continue;

      var solved = solveOptimal(n, lit);
      if (!solved) continue;

      var puzzle = { n: n, lit: lit, optimal: solved.moves, sig: sig };
      if (!fallback) fallback = puzzle;
      if (solved.moves >= band[0]) return puzzle;
    }

    if (fallback) return fallback;

    // Unreachable in practice — the loop above would have to draw the empty
    // board 200 times running. Still cheaper to have an answer than to throw.
    var last = pressRandomK(n, 1);
    return { n: n, lit: last, optimal: 1, sig: signature(last) };
  }

  // ---------- board ----------

  function buildBoard() {
    board.style.setProperty("--n", String(size));
    board.textContent = "";
    tileEls = [];
    var total = size * size;
    for (var i = 0; i < total; i++) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "tile";
      el.dataset.i = String(i);
      el.setAttribute(
        "aria-label",
        "Row " + (((i / size) | 0) + 1) + ", column " + ((i % size) + 1),
      );
      board.appendChild(el);
      tileEls.push(el);
    }
  }

  function renderTile(i) {
    var on = state[i] === 1;
    tileEls[i].classList.toggle("tile--on", on);
    tileEls[i].setAttribute("aria-pressed", on ? "true" : "false");
  }

  function renderAll() {
    for (var i = 0; i < state.length; i++) renderTile(i);
  }

  function affected(i) {
    var r = (i / size) | 0;
    var c = i % size;
    var out = [i];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }

  // The model changes first and the tiles re-render from it immediately; the
  // pulse is decoration layered on top, never a gate. Nothing here waits on an
  // animation, which is why tapping faster than the animation cannot
  // desynchronise the board.
  function tap(i) {
    if (ended) return;
    if (startedAt === null) startClock();

    var hit = affected(i);
    var k;

    for (k = 0; k < hit.length; k++) {
      state[hit[k]] ^= 1;
      renderTile(hit[k]);
      tileEls[hit[k]].classList.remove("tile--flip");
    }
    void board.offsetWidth; // one reflow, so a re-tap restarts the animation
    for (k = 0; k < hit.length; k++) tileEls[hit[k]].classList.add("tile--flip");

    moves++;
    updateHud();
    sndFlip();

    if (isCleared(state)) win(i);
  }

  function win(lastIndex) {
    ended = true;
    stopClock();
    /* Here rather than in showResult(), whose renderGlobalBest call is behind
       `level === LB_LEVEL && perfect` — most finished boards never reach it,
       and every finished board earns the sticker. stopClock() has just stamped
       finalMs. */
    recordPlay("flip-it", Math.round(finalMs), true);
    board.classList.add("is-locked");
    sndWin();

    // A ripple outward from the tile that finished it.
    var lr = (lastIndex / size) | 0;
    var lc = lastIndex % size;
    var furthest = 0;
    for (var i = 0; i < tileEls.length; i++) {
      var d = Math.abs(((i / size) | 0) - lr) + Math.abs((i % size) - lc);
      if (d > furthest) furthest = d;
      tileEls[i].style.setProperty("--d", String(d));
    }
    board.classList.add("is-cleared");

    clearTimeout(rippleHandle);
    rippleHandle = setTimeout(showResult, furthest * RIPPLE_STEP_MS + 340);
  }

  // ---------- clock ----------

  function elapsedMs() {
    if (finalMs !== null) return finalMs;
    if (startedAt === null) return 0;
    return performance.now() - startedAt;
  }


  function startClock() {
    startedAt = performance.now();
    finalMs = null;
    clearInterval(tickHandle);
    tickHandle = setInterval(updateHud, TICK_MS);
  }

  function stopClock() {
    finalMs = startedAt === null ? 0 : performance.now() - startedAt;
    clearInterval(tickHandle);
    tickHandle = null;
    updateHud();
  }

  function updateHud() {
    movesVal.textContent = String(moves);
    timeVal.textContent = formatTime(elapsedMs());
  }

  // ---------- result ----------

  function showResult() {
    var perfect = moves === optimal;
    var key = level;
    var prev = bests[key] || null;
    var isNewBest =
      !prev || moves < prev.moves || (moves === prev.moves && finalMs < prev.ms);

    if (isNewBest) {
      bests[key] = { moves: moves, ms: Math.round(finalMs) };
      writeBests();
    }

    overlayBadge.hidden = !perfect;
    overlaySub.textContent =
      "YOU " + moves + (moves === 1 ? " MOVE" : " MOVES") + " · OPTIMAL " + optimal;
    overlayTime.textContent =
      "Time " + formatTime(finalMs) + " · " +
      (isNewBest ? "New personal best" : "Best " + prev.moves + " moves");

    shareNote.classList.remove("show");

    // The end card is complete before the leaderboard is asked anything, so a
    // slow or failed request costs nothing but this one line.
    if (level === LB_LEVEL && perfect) {
      lbHint.hidden = true;
      renderGlobalBest(globalBest, {
        slug: "flip-it",
        score: Math.round(finalMs),
        isRecord: function (score, best) { return score <= best; },
        label: function (best) { return "Fastest perfect solve " + formatTime(best); },
        recordLabel: "★ New global best ★",
        pending: "Global best …",
        unavailable: "Global best unavailable",
      });
    } else {
      globalBest.hidden = true;
      lbHint.hidden = false;
    }

    overlay.classList.add("show");
  }

  function hideOverlay() {
    overlay.classList.remove("show");
    globalBest.hidden = true;
    globalBest.classList.remove("new-global");
    lbHint.hidden = true;
    overlayBadge.hidden = true;
  }

  // ---------- lifecycle ----------

  function clearRun() {
    clearTimeout(rippleHandle);
    clearInterval(tickHandle);
    tickHandle = null;
    rippleHandle = null;
    ended = false;
    moves = 0;
    startedAt = null;
    finalMs = null;
    hideOverlay();
    board.classList.remove("is-locked", "is-cleared");
  }

  /** Reset: back to this board's starting pattern. Not a new puzzle. */
  function resetBoard() {
    clearRun();
    state = new Uint8Array(startState);
    renderAll();
    updateHud();
  }

  /** The topbar refresh: a fresh board at the current level. */
  function deal() {
    clearRun();
    var puzzle = generate(level);
    size = puzzle.n;
    startState = new Uint8Array(puzzle.lit);
    state = new Uint8Array(puzzle.lit);
    optimal = puzzle.optimal;
    pushRecent(puzzle.sig);
    if (tileEls.length !== size * size) buildBoard();
    renderAll();
    updateHud();
  }

  function syncLevelButtons() {
    var btns = levels.querySelectorAll(".level-btn");
    for (var i = 0; i < btns.length; i++) {
      var active = btns[i].dataset.level === level;
      btns[i].classList.toggle("is-active", active);
      btns[i].setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setLevel(next) {
    if (LEVEL_ORDER.indexOf(next) === -1 || next === level) return;
    level = next;
    writeLevel(level);
    syncLevelButtons();
    deal();
  }

  // ---------- share ----------

  function shareUrl() {
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("moves", String(moves));
    url.searchParams.set("level", level);
    return url.toString();
  }

  /** A shared link carries the friend's score and the level they played. */
  function checkChallengeLink() {
    if (!challengeBanner) return;
    var params = new URLSearchParams(location.search);
    var theirMoves = parseInt(params.get("moves"), 10);
    var theirLevel = params.get("level");
    if (!isFinite(theirMoves) || theirMoves <= 0) return;

    // Links shared before levels existed carry ?size= instead.
    if (LEVEL_ORDER.indexOf(theirLevel) === -1) {
      theirLevel = LEGACY_SIZE_LEVEL[params.get("size")] || null;
    }

    var label = "the board";
    if (theirLevel) {
      label = LEVELS[theirLevel].label;
      level = theirLevel; // read before the first deal, so play starts on their level
    }
    challengeBanner.textContent =
      "A friend cleared " + label + " in " + theirMoves +
      (theirMoves === 1 ? " move" : " moves") + " — tap to dismiss and beat it";
    challengeBanner.classList.add("show");
    challengeBanner.addEventListener("click", function () {
      challengeBanner.classList.remove("show");
    });
  }

  // ---------- sound toggle ----------


  // ---------- how to play ----------
  initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });

  board.addEventListener("click", function (e) {
    var el = e.target.closest(".tile");
    if (!el) return;
    tap(parseInt(el.dataset.i, 10));
  });

  board.addEventListener("animationend", function (e) {
    if (e.animationName === "tile-flip") e.target.classList.remove("tile--flip");
  });

  levels.addEventListener("click", function (e) {
    var el = e.target.closest(".level-btn");
    if (!el) return;
    sndUi();
    setLevel(el.dataset.level);
  });

  resetBtn.addEventListener("click", function () { sndUi(); resetBoard(); });
  restartBtn.addEventListener("click", function () { sndUi(); deal(); });
  againBtn.addEventListener("click", function () { sndUi(); deal(); });
  initShare({
    btn: shareBtn,
    note: shareNote,
    title: "Flip It",
    text: function () {
      return "I cleared FLIP IT on " + LEVELS[level].label + " (" + size + "×" + size +
        ") in " + moves + (moves === 1 ? " move" : " moves") +
        " (optimal " + optimal + "). Can you beat that?";
    },
    url: shareUrl,
  });

  initSoundToggle(soundBtn, sndUi);

  initThemeToggle(themeBtn);

  bindOverlay(overlay, {
    primary: againBtn,
    label: "Game over",
  });

  checkChallengeLink();
  syncLevelButtons();
  deal();
})();
