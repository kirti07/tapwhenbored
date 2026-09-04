import { renderGlobalBest } from "../shared/ui/leaderboard.js";

(function () {
  "use strict";

  var SIZES = [5, 6, 7];
  var DEFAULT_SIZE = 5;

  // Minimum optimal-move count a generated board must need, per size. Measured
  // over the random population: 5x5 spans 4-15 optimal moves with 60% at 10 or
  // more, 6x6 spans 7-28, 7x7 spans 13-37. These floors cut the trivial tail
  // without making generation retry more than a couple of times.
  var MIN_OPTIMAL = { 5: 10, 6: 15, 7: 20 };
  var GEN_ATTEMPTS = 200;
  var RECENT_MAX = 12;

  // Only 5x5 perfect solves reach the leaderboard. Boards are random, so a
  // plain "fewest moves" record would just log whoever drew the easiest board —
  // the reason untangle has no leaderboard at all. Requiring the run to match
  // the computed optimal removes that, and timing it keeps the record moving.
  // Mixing three board sizes into one record would put the problem straight
  // back, so the other two sizes are personal-best only.
  var LB_SIZE = 5;

  var RIPPLE_STEP_MS = 45;
  var TICK_MS = 250;

  var BEST_KEY = "flipIt:v1";
  var RECENT_KEY = "flipItRecent";
  var SIZE_KEY = "flipItSize";
  var SOUND_KEY = "twb_sound"; // shared with bubble-tap: one sound preference

  var board = document.getElementById("board");
  var movesVal = document.getElementById("movesVal");
  var timeVal = document.getElementById("timeVal");
  var sizes = document.getElementById("sizes");
  var resetBtn = document.getElementById("resetBtn");
  var newBtn = document.getElementById("newBtn");
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

  var size = readSize();
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
  var soundOn = readSound();
  var bests = readBests();

  // ---------- storage (all of it optional, none of it load-bearing) ----------

  function readSize() {
    try {
      var v = parseInt(localStorage.getItem(SIZE_KEY), 10);
      return SIZES.indexOf(v) !== -1 ? v : DEFAULT_SIZE;
    } catch (e) { return DEFAULT_SIZE; }
  }

  function writeSize(v) {
    try { localStorage.setItem(SIZE_KEY, String(v)); } catch (e) { /* ignore */ }
  }

  function readRecent() {
    try {
      var v = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(v) ? v.slice(-RECENT_MAX) : [];
    } catch (e) { return []; }
  }

  function pushRecent(sig) {
    recent.push(sig);
    if (recent.length > RECENT_MAX) recent = recent.slice(-RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) { /* ignore */ }
  }

  function readBests() {
    try {
      var v = JSON.parse(localStorage.getItem(BEST_KEY));
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }

  function writeBests() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) { /* ignore */ }
  }

  function readSound() {
    try { return localStorage.getItem(SOUND_KEY) !== "false"; } catch (e) { return true; }
  }

  function writeSound() {
    try { localStorage.setItem(SOUND_KEY, String(soundOn)); } catch (e) { /* ignore */ }
  }

  // ---------- audio (tiny, procedural, no files) ----------
  var actx = null;
  function ctx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    return actx;
  }

  function tone(freq, dur, type, gain, delay) {
    if (!soundOn) return;
    try {
      var c = ctx();
      var at = c.currentTime + (delay || 0);
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g).connect(c.destination);
      osc.start(at);
      osc.stop(at + dur);
    } catch (e) { /* audio not available, ignore */ }
  }

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
   * toggles i — so matrixFor(n) doubles as the coefficient matrix. 5x5 has a
   * two-dimensional null space, so four solutions exist and the lightest wins;
   * 6x6 and 7x7 have exactly one solution each.
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

    // 2 free variables on 5x5, none on 6x6 and 7x7. The cap is a guard against
    // a size that was never meant to be here, not a real case.
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

  /**
   * A fresh board, solvable by construction: it is built by pressing a random
   * set of tiles on an empty grid, so the presses themselves are a solution and
   * an impossible puzzle cannot be produced. Boards that are trivial, already
   * clear, or served in the last dozen deals are rejected and redrawn.
   */
  function generate(n) {
    var N = n * n;
    var fallback = null;
    var floor = MIN_OPTIMAL[n];

    for (var pass = 0; pass < 2; pass++) {
      for (var attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
        var lit = new Uint8Array(N);
        for (var i = 0; i < N; i++) if (Math.random() < 0.5) press(n, lit, i);
        if (isCleared(lit)) continue;

        var sig = signature(lit);
        if (recent.indexOf(sig) !== -1) continue;

        var solved = solveOptimal(n, lit);
        if (!solved) continue;

        var puzzle = { lit: lit, optimal: solved.moves, sig: sig };
        if (!fallback) fallback = puzzle;
        if (solved.moves >= floor) return puzzle;
      }
      floor -= 2; // relax once, then take the best thing we saw
    }

    if (fallback) return fallback;

    // Unreachable in practice — every pass above would have to draw the empty
    // board 200 times running. Still cheaper to have an answer than to throw.
    var last = new Uint8Array(N);
    press(n, last, 0);
    return { lit: last, optimal: 1, sig: signature(last) };
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

  function formatTime(ms) {
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
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
    var key = String(size);
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
    if (size === LB_SIZE && perfect) {
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

  /** New Puzzle: a fresh board at the current size. */
  function deal() {
    clearRun();
    var puzzle = generate(size);
    startState = new Uint8Array(puzzle.lit);
    state = new Uint8Array(puzzle.lit);
    optimal = puzzle.optimal;
    pushRecent(puzzle.sig);
    if (tileEls.length !== size * size) buildBoard();
    renderAll();
    updateHud();
  }

  function syncSizeButtons() {
    var btns = sizes.querySelectorAll(".size-btn");
    for (var i = 0; i < btns.length; i++) {
      var active = parseInt(btns[i].dataset.size, 10) === size;
      btns[i].classList.toggle("is-active", active);
      btns[i].setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setSize(next) {
    if (SIZES.indexOf(next) === -1 || next === size) return;
    size = next;
    writeSize(size);
    syncSizeButtons();
    deal();
  }

  // ---------- share ----------

  function shareUrl() {
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("moves", String(moves));
    url.searchParams.set("size", String(size));
    return url.toString();
  }

  function shareResult() {
    var url = shareUrl();
    var text =
      "I cleared FLIP IT " + size + "×" + size + " in " + moves +
      (moves === 1 ? " move" : " moves") + " (optimal " + optimal + "). Can you beat that?";

    if (navigator.share) {
      navigator.share({ title: "Flip It", text: text, url: url }).catch(function () {});
      return;
    }

    var payload = text + " " + url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(showShareNote).catch(function () {});
    }
  }

  function showShareNote() {
    shareNote.classList.add("show");
  }

  /** A shared link carries the friend's score and the size they played. */
  function checkChallengeLink() {
    if (!challengeBanner) return;
    var params = new URLSearchParams(location.search);
    var theirMoves = parseInt(params.get("moves"), 10);
    var theirSize = parseInt(params.get("size"), 10);
    if (!isFinite(theirMoves) || theirMoves <= 0) return;

    var label = "the board";
    if (SIZES.indexOf(theirSize) !== -1) {
      label = theirSize + "×" + theirSize;
      size = theirSize; // read before the first deal, so play starts on their size
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

  function syncSound() {
    soundBtn.classList.toggle("is-off", !soundOn);
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundBtn.setAttribute("aria-label", soundOn ? "Sound on" : "Sound off");
  }

  // ---------- how to play ----------
  function openHowto() {
    howtoSheet.classList.add("show");
    howtoBackdrop.classList.add("show");
  }

  function closeHowto() {
    howtoSheet.classList.remove("show");
    howtoBackdrop.classList.remove("show");
  }

  howtoBtn.addEventListener("click", openHowto);
  howtoBackdrop.addEventListener("click", closeHowto);

  board.addEventListener("click", function (e) {
    var el = e.target.closest(".tile");
    if (!el) return;
    tap(parseInt(el.dataset.i, 10));
  });

  board.addEventListener("animationend", function (e) {
    if (e.animationName === "tile-flip") e.target.classList.remove("tile--flip");
  });

  sizes.addEventListener("click", function (e) {
    var el = e.target.closest(".size-btn");
    if (!el) return;
    sndUi();
    setSize(parseInt(el.dataset.size, 10));
  });

  resetBtn.addEventListener("click", function () { sndUi(); resetBoard(); });
  newBtn.addEventListener("click", function () { sndUi(); deal(); });
  againBtn.addEventListener("click", function () { sndUi(); deal(); });
  shareBtn.addEventListener("click", shareResult);

  soundBtn.addEventListener("click", function () {
    soundOn = !soundOn;
    writeSound();
    syncSound();
    if (soundOn) sndUi();
  });

  checkChallengeLink();
  syncSound();
  syncSizeButtons();
  deal();
})();
