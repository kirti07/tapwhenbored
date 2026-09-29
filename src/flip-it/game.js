import { renderGlobalBest } from "../shared/ui/leaderboard.js";
import { initHowto, initShare, bindOverlay } from "../shared/ui/shell.js";
import { tone, initSoundToggle } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { getJSON, setJSON, get as getPref, set as setPref } from "../shared/ui/prefs.js";
import { recordPlay } from "../shared/ui/progress.js";
import { getName, clean } from "../shared/ui/player.js";
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

  var GEN_ATTEMPTS = 200;
  var RECENT_MAX = 12;
  var DEAL_ATTEMPTS = 40; // seeds tried before a recently seen board is accepted

  // A challenge replays the sharer's exact board. It is offered on Easy and
  // Medium only — a product decision; Hard stays a personal-best level.
  var CHALLENGE_LEVELS = ["easy", "medium"];
  var MAX_BEAT_MS = 60 * 60 * 1000; // a longer "time to beat" is a broken link

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
  var challengeCard = document.getElementById("challenge");
  var challengeWho = document.getElementById("challengeWho");
  var challengeBeat = document.getElementById("challengeBeat");
  var challengeLevel = document.getElementById("challengeLevel");
  var beatStat = document.getElementById("beatStat");
  var beatVal = document.getElementById("beatVal");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var themeBtn = document.getElementById("themeBtn");

  var level = readLevel();
  var size = LEVELS[level].sizes[0]; // the dealt board decides; this is a seed
  var state = null;      // Uint8Array, 1 = lit
  var startState = null; // the board Reset returns to
  var seed = 0;          // what built this board; a challenge link carries it
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
  var challenge = readChallenge(); // null, or the run a shared link asks you to beat

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

  // ---------- seeded boards ----------
  //
  // Every board is built from a 32-bit seed, so the seed alone reproduces it on
  // any device: that is what makes a challenge link (and a party round) the same
  // board for everyone. mulberry32 is integer maths throughout, so it gives the
  // same sequence in every engine. It is a local copy on purpose — a shared
  // module used by two games would become a chunk of its own and one more
  // request on both pages.
  //
  // Changing anything that consumes `rand` changes which board an old seed
  // builds. A live challenge link would then replay a different board.

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  /** An empty grid with k distinct random tiles pressed. */
  function pressRandomK(n, k, rand) {
    var N = n * n;
    var lit = new Uint8Array(N);
    var idx = [];
    for (var i = 0; i < N; i++) idx.push(i);
    for (i = N - 1; i > 0; i--) {                 // Fisher-Yates, partial
      var j = (rand() * (i + 1)) | 0;
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    for (i = 0; i < k; i++) press(n, lit, idx[i]);
    return lit;
  }

  /**
   * The board a level and a seed build — a pure function of the two, and
   * nothing else. Solvable by construction: pressing k distinct tiles on an
   * empty grid makes those presses a solution, so an impossible puzzle cannot
   * be produced and the optimal is k in all but a few percent of draws (a
   * shorter route can exist through the null space). The solver still has the
   * last word on `optimal`; a draw that lands under the level's floor is
   * redrawn from the same stream.
   *
   * It must not read anything else. Avoiding recently seen boards is deal()'s
   * job, done by trying another seed — if it happened in here, a board would
   * depend on the browser that built it, and a shared seed would not replay.
   */
  function generate(lvl, seedValue) {
    var rand = mulberry32(seedValue);
    var cfg = LEVELS[lvl];
    var n = cfg.sizes[(rand() * cfg.sizes.length) | 0];
    var band = cfg.moves[n];
    var k = band[0] + ((rand() * (band[1] - band[0] + 1)) | 0);
    var fallback = null;

    for (var attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
      var lit = pressRandomK(n, k, rand);
      if (isCleared(lit)) continue;

      var solved = solveOptimal(n, lit);
      if (!solved) continue;

      var puzzle = { n: n, lit: lit, optimal: solved.moves, sig: signature(lit) };
      if (!fallback) fallback = puzzle;
      if (solved.moves >= band[0]) return puzzle;
    }

    if (fallback) return fallback;

    // Unreachable in practice — the loop above would have to draw the empty
    // board 200 times running. Still cheaper to have an answer than to throw.
    var last = pressRandomK(n, 1, rand);
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
    // slow or failed request costs nothing but this one line. A challenge run
    // is unranked (leaderboard.js refuses seeded runs), so the same line
    // answers the only question that run asked instead.
    if (challenge) {
      lbHint.hidden = true;
      globalBest.hidden = false;
      globalBest.textContent = verdict(finalMs, challenge);
    } else if (level === LB_LEVEL && perfect) {
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

  /**
   * A fresh board at the current level, from a fresh seed. A seed whose board
   * was served in the last dozen deals is passed over for another, so a player
   * does not meet the same small board twice in a row.
   */
  function deal() {
    leaveChallenge();
    var s, puzzle;
    for (var i = 0; i < DEAL_ATTEMPTS; i++) {
      s = randomSeed();
      puzzle = generate(level, s);
      if (recent.indexOf(puzzle.sig) === -1) break;
    }
    load(puzzle, s);
    pushRecent(puzzle.sig);
  }

  /** Put a built board on the table. */
  function load(puzzle, seedValue) {
    clearRun();
    seed = seedValue;
    size = puzzle.n;
    startState = new Uint8Array(puzzle.lit);
    state = new Uint8Array(puzzle.lit);
    optimal = puzzle.optimal;
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

  // ---------- challenges ----------
  //
  // A challenge link is this page's own URL with the board's seed, its level,
  // the time to beat and, when the sharer has set one, their name:
  //   /flip-it/?seed=1k3x9z&level=easy&beat=42180&by=Riya
  // Opening it replays that exact board. The URL is the whole state: while it
  // carries a seed the run is a challenge, and leaderboard.js reads the same
  // URL to keep the run off the global boards. Leaving the challenge (a new
  // board, a new level) strips the query, which makes the next run ranked again.

  /** The challenge in this page's URL, or null if it has none or a bad one. */
  function readChallenge() {
    var params = new URLSearchParams(location.search);
    var rawSeed = params.get("seed") || "";
    var lvl = params.get("level");
    var beat = Number(params.get("beat"));
    if (!/^[0-9a-z]{1,7}$/.test(rawSeed)) return null;
    var seedValue = parseInt(rawSeed, 36);
    if (seedValue > 0xffffffff) return null;
    if (CHALLENGE_LEVELS.indexOf(lvl) === -1) return null;
    if (!Number.isInteger(beat) || beat <= 0 || beat > MAX_BEAT_MS) return null;
    return { seed: seedValue, level: lvl, beat: beat, by: clean(params.get("by")) };
  }

  function canChallenge() {
    return CHALLENGE_LEVELS.indexOf(level) !== -1;
  }

  function showChallenge() {
    challengeWho.textContent = (challenge.by || "A friend") + " cleared this in";
    challengeBeat.textContent = "Beat " + formatTime(challenge.beat);
    challengeLevel.textContent = LEVELS[challenge.level].label;
    beatVal.textContent = formatTime(challenge.beat);
    challengeCard.hidden = false;
    beatStat.hidden = false;
  }

  function leaveChallenge() {
    if (!challenge) return;
    challenge = null;
    challengeCard.hidden = true;
    beatStat.hidden = true;
    history.replaceState(history.state, "", location.pathname);
  }

  /** One line for the end card: did this run beat the link? */
  function verdict(ms, c) {
    var who = c.by || "your friend";
    var gap = (Math.abs(c.beat - ms) / 1000).toFixed(1) + "s";
    return ms < c.beat
      ? "You beat " + who + " by " + gap
      : "Still " + gap + " behind " + who;
  }

  function shareUrl() {
    var url = new URL(location.pathname, location.origin);
    if (!canChallenge()) return url.toString();
    url.searchParams.set("seed", seed.toString(36));
    url.searchParams.set("level", level);
    url.searchParams.set("beat", String(Math.round(finalMs)));
    var name = getName();
    if (name) url.searchParams.set("by", name);
    return url.toString();
  }

  function track(name) {
    try { window.gtag("event", name, { game: "flip-it" }); } catch (e) { /* analytics never matters */ }
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
      return canChallenge()
        ? "I cleared this FLIP IT board in " + formatTime(finalMs) + ". Same board — beat me."
        : "I cleared FLIP IT on " + LEVELS[level].label + " (" + size + "×" + size +
          ") in " + moves + (moves === 1 ? " move" : " moves") +
          " (optimal " + optimal + "). Can you beat that?";
    },
    url: shareUrl,
  });
  shareBtn.addEventListener("click", function () {
    if (canChallenge()) track("challenge_shared");
  });

  initSoundToggle(soundBtn, sndUi);

  initThemeToggle(themeBtn);

  bindOverlay(overlay, {
    primary: againBtn,
    label: "Game over",
  });

  if (challenge) {
    level = challenge.level; // not written to prefs: the link's level is theirs
    showChallenge();
    load(generate(level, challenge.seed), challenge.seed);
    track("challenge_link_opened");
  } else {
    deal();
  }
  syncLevelButtons();
})();
