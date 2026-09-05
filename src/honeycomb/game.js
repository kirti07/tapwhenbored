import { renderGlobalBest } from "../shared/ui/leaderboard.js";
import { initHowto, initShare, createNote, bindOverlay } from "../shared/ui/shell.js";
import { isOn as soundIsOn, toggle as toggleSound, onChange as onSoundChange, resume as resumeAudio } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { get as getPref, set as setPref } from "../shared/ui/prefs.js";

(function () {
  "use strict";

  var MIN_TILES = 30, MAX_TILES = 42;
  var REVEAL_MIN = 0.4, REVEAL_MAX = 0.5;
  // Share of each clue value held back from the opening reveal so that TAPPING
  // a safe tile pays off too. Opening clues and informative taps come from the
  // same pool — tiles with 1-4 bomb neighbours — and the opening used to take
  // essentially all of it, leaving the player a hidden pool of tiles that could
  // not have been a clue in the first place: 73% of safe taps showed a 0, and
  // 11% of hives had no informative safe tap anywhere on the board. Held back
  // per clue value rather than off the top, so the tap pool inherits the same
  // spread of numbers instead of only the leftover 1s.
  // Measured at 0.4: 47% zeros, 53% informative, and no hive without one.
  var CLUE_RESERVE_SHARE = 0.4;
  var MIN_SAFE_TAPS = 6;     // guarantees this many SAFE (non-bomb) hidden tiles at the start
  // Share of fully-enclosed cells held back as SAFE tiles. Left to itself the
  // generator makes essentially all of them bombs (see buildWitness), which
  // turns "blast every enclosed tile" into free, risk-free progress.
  // Tuned so an enclosed hidden tile is a bomb at the same rate as any other
  // hidden tile (measured: 55.7% vs a 56.1% hidden-tile baseline) — a boxed-in
  // "?" then tells the player nothing on its own, which is the point. Re-measure
  // whenever CLUSTER_BIAS, BOMB_DENSITY or CLUE_RESERVE_SHARE moves: clustering
  // pulls bombs into the dense middle of the hive, which is exactly where
  // enclosed cells are, and the reserve share changes the hidden-tile baseline
  // this is being matched against.
  var ENCLOSED_SAFE_SHARE = 0.25;
  // Chance of placing each bomb next to an existing cluster rather than at
  // random. Clue values are capped by how many bombs happen to touch a tile,
  // so scattering bombs evenly yields almost nothing above a 2 — this is what
  // manufactures the 3s and 4s. Rewards growing a 1 or 2, and actively avoids
  // pushing a cell past MAX_CLUE, since a 5 or 6 can never be shown at all.
  // Held below the old 0.7 because tight clusters leave whole districts of the
  // hive with no bomb within reach, and every tile in one shows a 0 however it
  // is revealed. 0.45 buys ~6 points of informative taps and better bomb-hint
  // coverage for about half a point of opening 4s.
  var CLUSTER_BIAS = 0.45;
  var MAX_HEX = 56; // px cap on the hex "radius" (center to vertex)
  // Cap on a hive's bounding box, in hex-radius units. computeLayout sizes the
  // hexes to fit the board box, so a sprawling hive is simply drawn small —
  // which is why hex size cannot be defended with a lower clamp there (see
  // computeLayout) and has to be defended here instead. At this cap the
  // narrowest phone we support (.board-wrap is 331px at a 360px viewport)
  // still gets ~19px hexes, a 38px-wide tile. Raising it shrinks tiles on
  // small screens; lowering it rounds hives out and costs shape retries —
  // 74% of blobs comply at 17, 52% at 16.
  var MAX_SPAN_UNITS = 17;
  var BRANCH_BIAS = 0.4;     // probability of preferring an arm-extending frontier cell over a uniform-random one
  // Whole-blob retries, hunting for a shape that fits MAX_SPAN_UNITS and isn't
  // clue-eligibility-starved. A rejected blob costs only its own growth — the
  // bomb layout is skipped — so the headroom is close to free: at 5 attempts
  // 1.5% of the largest hives still overran the cap, at 8 none do, for 0.1ms
  // per hive.
  var SHAPE_ATTEMPTS = 8;
  var BEST_KEY = "honeycomb.best";
  // Flat-top axial neighbour offsets.
  var NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // The ONE cell a safe tile ever tries: 12 o'clock. It does not scan the
  // other five — a blocked 12 o'clock is what makes the tile reveal in place
  // instead of moving, and that choice is the whole game.
  var TWELVE_OCLOCK = [0, -1];
  var FLASH_MS = 150;
  var BLAST_MS = 400;
  // Safe tiles are the only fuel for prising open an interior bomb (a shift is
  // the sole way to drop a neighbour's degree without an explosion), so bombs
  // can't be much over a third of the hive or buildWitness starves.
  var BOMB_DENSITY = 0.38;
  var MIN_BOMBS = 4;
  // How long the board sits, cause visible, before the end card replaces it.
  var BREAK_HOLD_MS = 1500;
  // Must match the left/top transition on .tile in style.css — a shifted tile
  // only turns into a number once it has actually arrived. Zero when the
  // player has asked for less motion, since then the hop is instant.
  var MOVE_MS = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? 0 : 280;
  var MIN_CLUE = 1, MAX_CLUE = 4; // a revealed tile's number is always in this range
  var GEN_ATTEMPTS = 40; // bomb-layout retries, hunting for enough tiles in [MIN_CLUE, MAX_CLUE]

  var boardEl = document.getElementById("board");
  var tagline = document.getElementById("tagline");
  var timeVal = document.getElementById("timeVal");
  var bestVal = document.getElementById("bestVal");
  var bombsVal = document.getElementById("bombsVal");
  var newBtn = document.getElementById("newBtn");
  var overlay = document.getElementById("overlay");
  var overlayStatus = document.getElementById("overlayStatus");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayReason = document.getElementById("overlayReason");
  var overlaySub = document.getElementById("overlaySub");
  var globalScoreEl = document.getElementById("globalBest");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var soundBtn = document.getElementById("soundBtn");
  var themeBtn = document.getElementById("themeBtn");

  var tiles = [];         // [{id, q, r, revealed, bomb, removed}]
  var posMap = new Map(); // "q,r" -> tile id
  var tileEls = [];       // id-indexed { wrap, hex, label }
  var audioCtx = null;    // lazily created, reused across every bomb blast this session
  var ended = false;
  var moving = false;     // guards against a second tap landing mid-flash/blast
  var bombsRemaining = 0;
  var best = readBest();  // fastest completed run, in ms — null if none yet
  var runStartTime = 0;
  var finalElapsedMs = 0;
  var timerHandle = null;
  var lastStrandedCount = 0; // how many tiles the losing move cut loose, for the end card
  var clearedOnSplit = false; // won, but the final blast also cut the hive
  // Bumped by every generatePuzzle. Deferred work (the destination flash, the
  // blast, the hold before an end card) captures it and bails if it no longer
  // matches, so a pending timeout can't land on a board it wasn't started for
  // — "New hive" mid-explosion used to commit that blast to the fresh hive.
  var runToken = 0;
  var endTimer = null;

  // ---------- persistence ----------
  function readBest() {
    try {
      var v = getPref(BEST_KEY, null);
      return v ? parseInt(v, 10) : null;
    } catch (e) { return null; }
  }
  function writeBest(v) {
    best = v;
    setPref(BEST_KEY, v);
  }

  // ---------- timer ----------
  function formatTime(ms) {
    if (ms == null) return "--:--";
    var totalSec = Math.floor(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function liveElapsed() {
    return ended ? finalElapsedMs : (Date.now() - runStartTime);
  }

  // ---------- hex math (axial, flat-top) ----------
  function key(q, r) { return q + "," + r; }
  function parseKey(k) {
    var parts = k.split(",");
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }
  function unitX(q) { return 1.5 * q; }
  function unitY(q, r) { return Math.sqrt(3) * (r + q / 2); }

  // What a revealed tile displays: how many of its 6 neighbors are bombs —
  // not how many neighbors it has. This is purely the Minesweeper-style clue.
  function bombCountAt(q, r) {
    var n = 0;
    for (var i = 0; i < NEIGHBORS.length; i++) {
      var nk = key(q + NEIGHBORS[i][0], r + NEIGHBORS[i][1]);
      var neighborId = posMap.get(nk);
      if (neighborId !== undefined && tiles[neighborId].bomb) n++;
    }
    return n;
  }

  // Every hidden tile is a legal tap, wherever it sits in the hive — a tile
  // boxed in on all six sides simply can't SHIFT, so it reveals its number
  // where it stands. Only numbered landmarks are inert: they've already
  // shown their count and never move again.
  function isTappable(tile) {
    return !tile.removed && !tile.revealed;
  }

  function isConnected(map) {
    if (map.size === 0) return true;
    var start = map.keys().next().value;
    var seen = new Set([start]);
    var stack = [start];
    while (stack.length) {
      var k = stack.pop();
      var qr = parseKey(k);
      for (var i = 0; i < NEIGHBORS.length; i++) {
        var nk = key(qr[0] + NEIGHBORS[i][0], qr[1] + NEIGHBORS[i][1]);
        if (map.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    return seen.size === map.size;
  }

  // ---------- generation ----------
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  var lastBoardSnapshot = null; // lets "Play Again" replay the same hive after a loss
  var wonLastRun = false;

  function snapshotTiles() {
    return tiles.map(function (t) {
      return { id: t.id, q: t.q, r: t.r, revealed: t.revealed, bomb: t.bomb };
    });
  }

  function restoreSnapshot(snapshot) {
    tiles = snapshot.map(function (t) {
      return { id: t.id, q: t.q, r: t.r, revealed: t.revealed, bomb: t.bomb, removed: false };
    });
    posMap = new Map();
    tiles.forEach(function (t) { posMap.set(key(t.q, t.r), t.id); });
    bombsRemaining = tiles.filter(function (t) { return t.bomb; }).length;
  }

  // Grows one connected blob of `targetCount` tiles by flood-fill from a
  // single seed, biased toward arm-extending frontier cells (see
  // pickFrontierCell) for a branchier, less round silhouette.
  function growBlob(targetCount) {
    tiles = [];
    posMap = new Map();
    var occupied = new Set(["0,0"]);
    posMap.set("0,0", 0);
    tiles.push({ id: 0, q: 0, r: 0, revealed: false, bomb: false, removed: false });

    var frontier = new Set();
    addFrontier(0, 0, occupied, frontier);
    var nextId = 1;
    while (occupied.size < targetCount && frontier.size > 0) {
      var pick = pickFrontierCell(frontier, occupied);
      frontier.delete(pick);
      if (occupied.has(pick)) continue;
      occupied.add(pick);
      var qr = parseKey(pick);
      posMap.set(pick, nextId);
      tiles.push({ id: nextId, q: qr[0], r: qr[1], revealed: false, bomb: false, removed: false });
      nextId++;
      addFrontier(qr[0], qr[1], occupied, frontier);
    }
  }

  // With probability BRANCH_BIAS, prefers a frontier cell that only touches
  // 2 already-occupied cells (extends an arm) over one that touches 3+
  // (fills in a concave notch, rounding the blob out) — biases growth toward
  // a branchier silhouette. Falls back to a degree-1 cell only if no
  // degree-2 one exists, since a run of degree-1 picks produces a
  // one-tile-wide corridor whose tiles can never show a clue number above 1
  // (bombCountAt is capped by a tile's own degree). Otherwise picks
  // uniformly, same as before, so the blob still fills in naturally.
  function pickFrontierCell(frontier, occupied) {
    var arr = Array.from(frontier);
    if (Math.random() < BRANCH_BIAS) {
      var twos = arr.filter(function (k) { return degreeInKeySet(k, occupied) === 2; });
      var biased = twos.length > 0 ? twos : arr.filter(function (k) { return degreeInKeySet(k, occupied) === 1; });
      if (biased.length > 0) return biased[Math.floor(Math.random() * biased.length)];
    }
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Only builds a fresh random hive — generatePuzzle() below decides whether
  // to call this or replay the last one instead.
  function buildRandomTiles() {
    var targetCount = MIN_TILES + Math.floor(Math.random() * (MAX_TILES - MIN_TILES + 1));
    var targetEligible = Math.round(targetCount * 0.3);

    // A branchier shape lowers average tile degree, which caps how many
    // tiles can ever be eligible clues (bombCountAt <= a tile's own degree) — a bomb
    // layout retry alone can't fix a shape-level cap, so retry the whole
    // blob, not just the bomb layout, if the best shape found so far is
    // still well short of the eligibility target.
    // A shape can also starve the witness of shift room, so shapes are now
    // scored the same way layouts are: fitting the screen first, then bombs
    // actually placed, then eligibility.
    var bestShape = null, bestShapeScore = -1;
    for (var shapeAttempt = 0; shapeAttempt < SHAPE_ATTEMPTS; shapeAttempt++) {
      growBlob(targetCount);
      // A blob that sprawls past MAX_SPAN_UNITS can only be drawn at an
      // uncomfortably small hex size, so throw it back and grow another rather
      // than pay for a bomb layout on it. The exception is having nothing else
      // yet: a board that fits badly still beats no board at all.
      var bounds = hiveBounds();
      var span = Math.max(bounds.wUnits, bounds.hUnits);
      var fits = span <= MAX_SPAN_UNITS;
      if (!fits && bestShape !== null) continue;
      var bombCount = Math.min(tiles.length - 1, Math.max(MIN_BOMBS, Math.round(tiles.length * BOMB_DENSITY)));
      var eligibleCount = placeBombs(bombCount);
      // eligibleCount < 1000 and bombOrder.length < 1000, so this stays a
      // plain lexicographic comparison: fits, then bombs, then eligibility.
      var shapeScore = (fits ? 1000000 : 0) + bombOrder.length * 1000 + eligibleCount;
      if (shapeScore > bestShapeScore) {
        bestShapeScore = shapeScore;
        bestShape = {
          tiles: tiles,
          posMap: posMap,
          bombOrder: bombOrder,
          reservedSafeKeys: reservedSafeKeys,
        };
      }
      if (fits && bombOrder.length >= bombCount && eligibleCount >= targetEligible * 0.7) break;
    }
    tiles = bestShape.tiles;
    posMap = bestShape.posMap;
    bombOrder = bestShape.bombOrder;
    reservedSafeKeys = bestShape.reservedSafeKeys;
    bombsRemaining = bombOrder.length;

    // Group the eligible tiles by the number they would show and hold
    // CLUE_RESERVE_SHARE of EACH group back from the opening, so what stays
    // hidden for the player to tap has the same spread of 1s to 4s that the
    // opening does. Taking the reserve off the top instead would just move the
    // skew: the opening would keep the 3s and 4s and taps would pay in 1s.
    var byClue = new Map();
    tiles.filter(isOpeningClueCandidate).forEach(function (t) {
      var c = bombCountAt(t.q, t.r);
      if (!byClue.has(c)) byClue.set(c, []);
      byClue.get(c).push(t);
    });
    var eligible = [];
    byClue.forEach(function (group) {
      shuffle(group); // randomness within one clue value; the sort below is stable
      var held = Math.round(group.length * CLUE_RESERVE_SHARE);
      for (var gi = held; gi < group.length; gi++) eligible.push(group[gi]);
    });

    var revealFraction = REVEAL_MIN + Math.random() * (REVEAL_MAX - REVEAL_MIN);
    var revealCount = Math.min(eligible.length, Math.round(tiles.length * revealFraction));
    // Prefer revealing the higher bomb-neighbor counts (3-4) over 1s and 2s
    // when there's a choice — a stable sort by count descending over groups
    // already shuffled above, so the highest counts get first pick of the
    // reveal slots while staying random inside each count.
    var order = eligible.sort(function (a, b) {
      return bombCountAt(b.q, b.r) - bombCountAt(a.q, a.r);
    });
    for (var i = 0; i < revealCount; i++) order[i].revealed = true;

    ensureBombHints();
    // Runs last so it's the final word — movability is the hard requirement,
    // the legibility/hint passes above are just niceties and must not undo
    // it (the live-rechecked guard inside protects the hints, though).
    ensureSafeTapTargets(MIN_SAFE_TAPS);
  }

  // reuseBoard: replay the exact hive from the last run instead of building
  // a new random one — used for "Play Again" after a loss, so the player
  // can try the same puzzle again with what they've learned.
  function generatePuzzle(reuseBoard) {
    moving = false;
    clearedOnSplit = false;
    lastStrandedCount = 0;
    runToken++;
    clearTimeout(endTimer);
    clearTimeout(hintTimer);
    endTimer = null;
    hintTimer = null;
    if (reuseBoard && lastBoardSnapshot) {
      restoreSnapshot(lastBoardSnapshot);
    } else {
      buildRandomTiles();
      lastBoardSnapshot = snapshotTiles();
    }

    ended = false;
    clearInterval(timerHandle);
    runStartTime = Date.now();
    finalElapsedMs = 0;
    timerHandle = setInterval(updateHud, 250);
    buildDom();
    renderInstant();
    hideOverlay();
    updateHud();
    updateTagline();
  }

  // A tile can only ever be revealed if it isn't itself a bomb and 1-4 of
  // its neighbors are — 0 or 5-6 would break the "numbers are between 1 and
  // 4" rule, so such a tile just stays hidden instead.
  function isEligibleClue(t) {
    if (t.bomb) return false;
    var c = bombCountAt(t.q, t.r);
    return c >= MIN_CLUE && c <= MAX_CLUE;
  }

  // Which tiles may carry an OPENING clue. Same rule as isEligibleClue, minus
  // the tiles the witness has to shift out of the way: pre-revealing one
  // freezes it as a landmark and cuts the proven clearing path. Kept separate
  // from isEligibleClue because placeBombs scores layouts with that one while
  // reservedSafeKeys still holds the previous attempt's set.
  function isOpeningClueCandidate(t) {
    return isEligibleClue(t) && !reservedSafeKeys.has(key(t.q, t.r));
  }

  // Counts how many of a cell's six neighbours are present in an arbitrary
  // set of keys rather than the live posMap — used while searching candidate
  // bomb layouts on a throwaway copy of the hive.
  function degreeInKeySet(k, keySet) {
    var qr = parseKey(k);
    var n = 0;
    for (var i = 0; i < NEIGHBORS.length; i++) {
      if (keySet.has(key(qr[0] + NEIGHBORS[i][0], qr[1] + NEIGHBORS[i][1]))) n++;
    }
    return n;
  }

  // Solvability is BUILT, not tested. Rather than scatter bombs and hope a
  // clearing path exists, this walks a real run forward from the true
  // starting position and decides what each tapped tile is at the moment it
  // is tapped. Replaying the taps it records therefore clears every bomb it
  // placed — that record is a proof, not a sample.
  //
  // Each step makes the one move the walk needs: designate the tapped tile a
  // bomb and remove it, which is only legal if what is left is still
  // connected. An extreme boundary cell of a connected hex blob is always a
  // non-cut vertex, so a candidate exists on every step (measured over
  // thousands of hives, up to a bomb density of 0.70).
  //
  // This cannot fail outright, only undershoot `bombTarget`: whatever bombs
  // it did place are all the bombs the board has, and the recorded path
  // clears them. A short path just means an easier hive.
  function buildWitness(bombTarget, allKeys) {
    var occupied = new Set(allKeys);
    // An enclosed cell's six neighbours form a ring, so removing it can never
    // split the hive. That makes it a valid bomb candidate on EVERY step,
    // while edge cells drop in and out of the running as the shape changes —
    // so left alone the walk turns nearly all of them into bombs. Holding a
    // random share back as safe tiles is what keeps a boxed-in "?" genuinely
    // uncertain rather than a guaranteed bomb.
    var reserved = new Set();
    allKeys.forEach(function (k) {
      if (degreeInKeySet(k, occupied) >= 6 && Math.random() < ENCLOSED_SAFE_SHARE) reserved.add(k);
    });

    // Bomb clustering. bombAdj tracks, for every cell of the hive, how many
    // chosen bombs touch it — which IS that cell's future clue number. Cells
    // are scored by how much a candidate would grow a count that is already
    // on its way to 3 or 4, and penalised for tipping one past MAX_CLUE.
    var allCells = new Set(allKeys);
    var bombSet = new Set();
    var bombAdj = new Map();
    function eachNeighbour(k, fn) {
      var qr = parseKey(k);
      for (var i = 0; i < NEIGHBORS.length; i++) {
        var nk = key(qr[0] + NEIGHBORS[i][0], qr[1] + NEIGHBORS[i][1]);
        if (allCells.has(nk)) fn(nk);
      }
    }
    function clusterScore(k) {
      var score = 0;
      eachNeighbour(k, function (nk) {
        if (bombSet.has(nk)) return; // a bomb never shows a number
        var c = bombAdj.get(nk) || 0;
        score += c >= MAX_CLUE ? -2 : c;
      });
      return score;
    }
    function takeBomb(k) {
      bombSet.add(k);
      eachNeighbour(k, function (nk) { bombAdj.set(nk, (bombAdj.get(nk) || 0) + 1); });
    }

    // bombKeys doubles as the proof: replaying those taps in order clears
    // every bomb on the board.
    var bombKeys = [];
    // Each step consumes one hidden tile, so the walk is bounded by the hive.
    var guard = allKeys.length + 1;

    while (bombKeys.length < bombTarget && guard-- > 0) {
      // Every remaining tile is a candidate, so the witness has the same
      // freedom the player does.
      var bombCands = Array.from(occupied).filter(function (k) {
        if (reserved.has(k)) return false;
        var trial = new Set(occupied);
        trial.delete(k);
        return isConnected(trial);
      });
      if (bombCands.length > 0) {
        var chosen;
        if (Math.random() < CLUSTER_BIAS) {
          var best = -Infinity, top = [];
          for (var ci = 0; ci < bombCands.length; ci++) {
            var sc = clusterScore(bombCands[ci]);
            if (sc > best) { best = sc; top = [bombCands[ci]]; }
            else if (sc === best) top.push(bombCands[ci]);
          }
          chosen = top[Math.floor(Math.random() * top.length)];
        } else {
          chosen = bombCands[Math.floor(Math.random() * bombCands.length)];
        }
        takeBomb(chosen);
        bombKeys.push(chosen);
        occupied.delete(chosen);
        continue;
      }

      // Nothing tappable can be blasted without splitting the hive. Stopping
      // here just leaves a hive with fewer bombs than the target — still
      // fully clearable by the steps already recorded, only easier. (Measured
      // over thousands of hives: never once reached.)
      break;
    }

    return { bombKeys: bombKeys, reservedKeys: reserved };
  }

  // Tries several proven-clearable layouts and keeps the best: first by how
  // many bombs the witness actually managed to place, then by how many tiles
  // have a shot at being revealed (see isEligibleClue) — this is what
  // "design the hive structure" around the 1-4 clue rule actually means.
  //
  // bombOrder is the witness's bomb tap order — its length is the hive's real
  // bomb count, since the witness can undershoot the target.
  // reservedSafeKeys are the enclosed cells buildWitness held back as safe.
  // They only create uncertainty while they are still a "?", so the
  // opening-clue passes must leave them hidden.
  var bombOrder = [];
  var reservedSafeKeys = new Set();
  function placeBombs(bombCount) {
    var allKeys = tiles.map(function (t) { return key(t.q, t.r); });
    var targetEligible = Math.round(tiles.length * 0.3);
    var bestOrder = [], bestReserved = new Set(), bestEligible = -1, bestScore = -1;
    for (var attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
      var candidate = buildWitness(bombCount, allKeys);
      var bombKeys = new Set(candidate.bombKeys);
      tiles.forEach(function (t) { t.bomb = bombKeys.has(key(t.q, t.r)); });
      var eligibleCount = tiles.filter(isEligibleClue).length;
      // Bomb count dominates; eligibility breaks ties. eligibleCount can
      // never reach 1000, so this is a plain lexicographic comparison.
      var score = candidate.bombKeys.length * 1000 + eligibleCount;
      if (score > bestScore) {
        bestScore = score;
        bestEligible = eligibleCount;
        bestOrder = candidate.bombKeys;
        bestReserved = candidate.reservedKeys;
      }
      if (candidate.bombKeys.length >= bombCount && eligibleCount >= targetEligible) break;
    }
    bombOrder = bestOrder;
    reservedSafeKeys = bestReserved;
    var finalBombKeys = new Set(bombOrder);
    tiles.forEach(function (t) { t.bomb = finalBombKeys.has(key(t.q, t.r)); });
    return bestEligible;
  }

  function addFrontier(q, r, occupied, frontier) {
    for (var i = 0; i < NEIGHBORS.length; i++) {
      var k = key(q + NEIGHBORS[i][0], r + NEIGHBORS[i][1]);
      if (!occupied.has(k)) frontier.add(k);
    }
  }

  // Would un-revealing `tile` leave any of its bomb neighbors with zero
  // revealed neighbors? Must be re-checked against the CURRENT board state
  // immediately before each individual flip in a batch — two tiles can each
  // look like a safe flip in isolation while being each other's sole backup
  // hint for the same bomb, so pre-filtering a static list is not safe.
  function revealIsHintCritical(tile) {
    for (var i = 0; i < NEIGHBORS.length; i++) {
      var nk = key(tile.q + NEIGHBORS[i][0], tile.r + NEIGHBORS[i][1]);
      var nid = posMap.get(nk);
      if (nid === undefined || !tiles[nid].bomb) continue;
      var bomb = tiles[nid];
      var hasOtherHint = false;
      for (var j = 0; j < NEIGHBORS.length; j++) {
        var nk2 = key(bomb.q + NEIGHBORS[j][0], bomb.r + NEIGHBORS[j][1]);
        if (nk2 === key(tile.q, tile.r)) continue;
        var nid2 = posMap.get(nk2);
        if (nid2 !== undefined && tiles[nid2].revealed) { hasOtherHint = true; break; }
      }
      if (!hasOtherHint) return true;
    }
    return false;
  }

  // Best-effort: give every bomb at least one adjacent revealed clue. Can't
  // be a hard guarantee at this bomb density — a bomb boxed in by other
  // bombs, or whose only non-bomb neighbors would show a count above
  // MAX_CLUE, has no eligible neighbor to reveal, and is just left as-is.
  function ensureBombHints() {
    tiles.forEach(function (b) {
      if (!b.bomb) return;
      var hasHint = false;
      var candidates = [];
      for (var i = 0; i < NEIGHBORS.length; i++) {
        var nk = key(b.q + NEIGHBORS[i][0], b.r + NEIGHBORS[i][1]);
        var nid = posMap.get(nk);
        if (nid === undefined) continue;
        var neighbor = tiles[nid];
        if (neighbor.revealed) { hasHint = true; break; }
        if (isOpeningClueCandidate(neighbor)) candidates.push(neighbor);
      }
      if (hasHint || candidates.length === 0) return;
      // Deliberately uniform. This used to prefer an INTERIOR neighbour, to
      // avoid spending tiles from the edge pool that was the only tappable
      // one. Every tile is tappable now, so that preference had no upside
      // left and one sharp downside: it stripped the safe tiles out of the
      // interior, which made every boxed-in hidden tile a guaranteed bomb —
      // and since removing a boxed-in tile can never split the hive (its six
      // neighbours form a ring), "blast all the enclosed ones first" became a
      // free, risk-free opening worth a fifth of the objective.
      shuffle(candidates)[0].revealed = true;
    });
  }

  // A floor on SAFE (non-bomb) hidden tiles specifically — a hidden bomb is
  // also a legal tap, that's how blasting works, but counting it toward this
  // floor wouldn't give the player any actual room to manoeuvre.
  function ensureSafeTapTargets(minCount) {
    var safeHidden = tiles.filter(function (t) { return isTappable(t) && !t.bomb; });
    if (safeHidden.length >= minCount) return;
    var flippable = shuffle(tiles.filter(function (t) { return t.revealed; }));
    var have = safeHidden.length;
    for (var i = 0; i < flippable.length && have < minCount; i++) {
      if (revealIsHintCritical(flippable[i])) continue;
      flippable[i].revealed = false;
      have++;
    }
  }

  // ---------- DOM ----------
  function buildDom() {
    boardEl.innerHTML = "";
    tileEls = tiles.map(function (t) {
      var wrap = document.createElement("div");
      wrap.className = "tile";
      wrap.dataset.id = t.id;

      var rim = document.createElement("div");
      rim.className = "tile-rim";
      wrap.appendChild(rim);

      var hex = document.createElement("div");
      hex.className = "tile-hex";
      var label = document.createElement("span");
      label.className = "tile-label";
      hex.appendChild(label);
      wrap.appendChild(hex);
      boardEl.appendChild(wrap);
      return { wrap: wrap, label: label };
    });
  }

  // The hive's bounding box in hex-radius units — the units computeLayout
  // divides the available space by, so a span measured here is directly
  // comparable to the space a board is going to be given.
  function hiveBounds() {
    var minUX = Infinity, maxUX = -Infinity, minUY = Infinity, maxUY = -Infinity;
    posMap.forEach(function (_, k) {
      var qr = parseKey(k);
      var x = unitX(qr[0]), y = unitY(qr[0], qr[1]);
      if (x < minUX) minUX = x;
      if (x > maxUX) maxUX = x;
      if (y < minUY) minUY = y;
      if (y > maxUY) maxUY = y;
    });
    return {
      minUX: minUX,
      minUY: minUY,
      wUnits: (maxUX - minUX) + 2,
      hUnits: (maxUY - minUY) + Math.sqrt(3),
    };
  }

  function computeLayout() {
    var b = hiveBounds();
    var rect = boardEl.parentElement.getBoundingClientRect();
    // Capped from above only. A lower clamp here would draw the hive wider
    // than the box it was handed, and since body is overflow:hidden anything
    // past the viewport is not merely ugly but untappable: with the old 22px
    // floor, a 360px phone pushed the hive out of .board-wrap on 73% of boards
    // and clean off the screen on 27% of them. Hex size cannot be defended
    // here — only at generation time, by MAX_SPAN_UNITS.
    var size = Math.min(MAX_HEX, rect.width / b.wUnits, rect.height / b.hUnits);
    return { size: size, minUX: b.minUX, minUY: b.minUY, w: b.wUnits * size, h: b.hUnits * size };
  }

  function pixelFor(layout, q, r) {
    return {
      x: (unitX(q) - layout.minUX) * layout.size + layout.size,
      y: (unitY(q, r) - layout.minUY) * layout.size + layout.size * Math.sqrt(3) / 2,
    };
  }

  function render() {
    var layout = computeLayout();
    boardEl.style.width = layout.w + "px";
    boardEl.style.height = layout.h + "px";
    boardEl.style.setProperty("--hex-w", (2 * layout.size) + "px");
    boardEl.style.setProperty("--hex-h", (Math.sqrt(3) * layout.size) + "px");

    tiles.forEach(function (t) {
      if (t.removed) return;
      var el = tileEls[t.id];
      var p = pixelFor(layout, t.q, t.r);
      el.wrap.style.left = p.x + "px";
      el.wrap.style.top = p.y + "px";
      el.wrap.classList.toggle("tile--tappable", isTappable(t));
      if (t.revealed) {
        el.label.textContent = String(bombCountAt(t.q, t.r));
        el.wrap.removeAttribute("data-hidden");
      } else {
        // "?" is honest now: tapping a safe hidden tile always turns it into
        // a number, so the mark promises something the player can actually
        // cash in.
        el.label.textContent = "?";
        el.wrap.setAttribute("data-hidden", "true");
      }
    });
  }

  function renderInstant() {
    boardEl.classList.add("no-anim");
    render();
    void boardEl.getBoundingClientRect(); // flush, so the class can't be coalesced away
    boardEl.classList.remove("no-anim");
  }

  function triggerShake(el) {
    el.classList.remove("shake");
    void el.getBoundingClientRect();
    el.classList.add("shake");
  }

  // ---------- deterministic move resolution ----------
  // A safe tile checks exactly one cell — 12 o'clock. Free, and it shifts
  // there; taken, and this returns null, which means "stay put and reveal
  // where you stand". Either way the tile ends up numbered.
  function twelveOClockKey(tile) {
    return key(tile.q + TWELVE_OCLOCK[0], tile.r + TWELVE_OCLOCK[1]);
  }
  function resolveDestination(tile) {
    var k = twelveOClockKey(tile);
    return posMap.has(k) ? null : k;
  }

  function showFlash(destKey) {
    var layout = computeLayout();
    var qr = parseKey(destKey);
    var p = pixelFor(layout, qr[0], qr[1]);
    var wrap = document.createElement("div");
    wrap.className = "tile-flash";
    wrap.style.left = p.x + "px";
    wrap.style.top = p.y + "px";
    var hex = document.createElement("div");
    hex.className = "tile-flash-hex";
    wrap.appendChild(hex);
    boardEl.appendChild(wrap);
    return wrap;
  }

  function tapTile(id) {
    if (moving || ended) return;
    var tile = tiles[id];
    // The only tile that can't be tapped is one that has already shown its
    // number. A bare shake reads as "the game ignored me", so say why.
    if (!isTappable(tile)) {
      triggerShake(tileEls[id].wrap);
      showTapHint("That tile already showed its number — landmarks never move.");
      return;
    }

    if (tile.bomb) { blastTile(id); return; }

    var destKey = resolveDestination(tile);
    // 12 o'clock is occupied: nothing moves, so there is nothing to
    // telegraph and no way this can break the hive.
    if (destKey === null) { commitReveal(id); return; }

    moving = true;
    var token = runToken;
    var flash = showFlash(destKey);
    setTimeout(function () {
      if (token !== runToken) return;
      flash.remove();
      // commitMove clears `moving` itself, once the tile has landed.
      commitMove(id, destKey);
    }, FLASH_MS);
  }

  function showBurst(q, r) {
    var layout = computeLayout();
    var p = pixelFor(layout, q, r);
    var wrap = document.createElement("div");
    wrap.className = "tile-burst";
    wrap.style.left = p.x + "px";
    wrap.style.top = p.y + "px";
    var ring = document.createElement("div");
    ring.className = "tile-burst-ring";
    wrap.appendChild(ring);
    var wave1 = document.createElement("div");
    wave1.className = "tile-burst-shockwave";
    wrap.appendChild(wave1);
    var wave2 = document.createElement("div");
    wave2.className = "tile-burst-shockwave tile-burst-shockwave--2";
    wrap.appendChild(wave2);
    boardEl.appendChild(wrap);
    return wrap;
  }

  // A low pitch-sweeping thump plus a short filtered noise burst, synthesized
  // rather than a shipped audio file — created and played in the same call,
  // directly inside the click handler, so the AudioContext starts as a
  // direct result of the user gesture per browser autoplay rules.
  function playBombSound() {
    // Honeycomb synthesises its blast from an oscillator plus a filtered noise
    // buffer, which is not something the shared tone() helper does. It keeps
    // its own synthesis and takes only the site-wide mute from there.
    if (!soundIsOn()) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var now = audioCtx.currentTime;

      var osc = audioCtx.createOscillator();
      var oscGain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);
      oscGain.gain.setValueAtTime(0.001, now);
      oscGain.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(oscGain);
      oscGain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.36);

      var bufferSize = Math.floor(audioCtx.sampleRate * 0.22);
      var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      var noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      var filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, now);
      var noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.55, now + 0.01);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noise.start(now);
    } catch (e) { /* sound is a nice-to-have, never block the blast */ }
  }

  function blastTile(id) {
    moving = true;
    var tile = tiles[id];
    tileEls[id].wrap.classList.add("blasted");
    playBombSound();
    var burst = showBurst(tile.q, tile.r);
    var token = runToken;
    setTimeout(function () {
      if (token !== runToken) return;
      burst.remove();
      commitBlast(id);
      moving = false;
    }, BLAST_MS);
  }

  function commitBlast(id) {
    var tile = tiles[id];
    var srcKey = key(tile.q, tile.r);
    var newPosMap = new Map(posMap);
    newPosMap.delete(srcKey);
    var connected = isConnected(newPosMap);

    posMap = newPosMap;
    tile.removed = true;
    tileEls[id].wrap.remove();
    bombsRemaining--;

    render();
    updateHud(); // don't wait up to 250ms for the timer tick to show it

    // The all-clear outranks a split. Blasting the final bomb wins the run
    // even if that same explosion cut the hive in two — there is nothing
    // left to keep connected, and being told you lost after clearing the
    // board reads as a bug to the player.
    //
    // It is also the only ending other than a split: every hidden tile is
    // tappable and a bomb stays hidden until it is blasted, so there is
    // always a legal tap left while any bomb is.
    if (bombsRemaining === 0) { handleCleared(!connected); return; }

    if (!connected) handleBreak(newPosMap, newPosMap.keys().next().value);
  }

  // 12 o'clock was taken, so the tile stays where it is and just turns into a
  // numbered landmark. No tile moved, so the hive cannot have come apart.
  function commitReveal(id) {
    tiles[id].revealed = true;
    render();
  }

  function commitMove(id, destKey) {
    var tile = tiles[id];
    var srcKey = key(tile.q, tile.r);
    var newPosMap = new Map(posMap);
    newPosMap.delete(srcKey);
    newPosMap.set(destKey, tile.id);
    var connected = isConnected(newPosMap);

    posMap = newPosMap;
    var qr = parseKey(destKey);
    tile.q = qr[0];
    tile.r = qr[1];

    render(); // starts the slide; the tile is still a "?" while in flight

    // A safe tile always ends up numbered, but it reads the count from the
    // cell it LANDS on, so the number belongs on arrival rather than
    // mid-flight. `moving` stays set across the slide, which also stops the
    // tile being tapped a second time while it is still hidden.
    var token = runToken;
    setTimeout(function () {
      if (token !== runToken) return;
      tile.revealed = true;
      render();
      moving = false;
      if (!connected) handleBreak(newPosMap, destKey);
    }, MOVE_MS);
  }

  // Stops the clock at the moment the run actually ended and holds the board
  // for `holdMs` so the cause stays visible. The stamp has to happen here,
  // not in endRun: `ended` makes liveElapsed() read finalElapsedMs, so
  // leaving it unset showed 0:00 in the HUD for the whole hold.
  function finishRun(reason, holdMs) {
    ended = true;
    finalElapsedMs = Date.now() - runStartTime;
    clearInterval(timerHandle);
    updateHud();
    var token = runToken;
    clearTimeout(endTimer);
    endTimer = setTimeout(function () {
      if (token !== runToken) return;
      endRun(reason);
    }, holdMs);
  }

  function handleCleared(splitOnLastBlast) {
    clearedOnSplit = Boolean(splitOnLastBlast);
    tagline.textContent = "Every bomb is gone.";
    // A touch longer when the last blast also broke the hive, so the board
    // isn't replaced before the player has seen what happened.
    finishRun("cleared", clearedOnSplit ? 900 : 300);
  }

  function handleBreak(map, seedKey) {
    var seen = new Set([seedKey]);
    var stack = [seedKey];
    while (stack.length) {
      var k = stack.pop();
      var qr = parseKey(k);
      for (var i = 0; i < NEIGHBORS.length; i++) {
        var nk = key(qr[0] + NEIGHBORS[i][0], qr[1] + NEIGHBORS[i][1]);
        if (map.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    var stranded = 0;
    tiles.forEach(function (t) {
      if (t.removed) return;
      if (!seen.has(key(t.q, t.r))) {
        tileEls[t.id].wrap.classList.add("stranded");
        stranded++;
      }
    });
    // The piece the seed didn't reach is whichever side is smaller to name;
    // seen/stranded is arbitrary, so report the count the player can see
    // turning red.
    lastStrandedCount = stranded;
    tagline.textContent = "The hive split apart.";
    // Hold on the red group long enough to read it — the whole reason a lost
    // run used to feel like it just stopped.
    finishRun("broken", BREAK_HOLD_MS);
  }

  function endRun(reason) {
    // finishRun has already stopped the timer and stamped finalElapsedMs.
    // Clearing every bomb is now the only win, so one flag covers both jobs:
    // whether Play Again gets a fresh board, and whether the run counts
    // toward best time / the leaderboard. Running out of moves used to bank a
    // best time with bombs still on the board.
    wonLastRun = reason === "cleared";

    if (wonLastRun && (best === null || finalElapsedMs < best)) writeBest(finalElapsedMs);
    updateHud();
    showOverlay(reason);

    // Only a win has a completion time worth racing. A run that ran out of
    // moves has no valid time to submit, and showOverlay has already hidden
    // the line, so there is nothing left to do here.
    if (!wonLastRun) return;

    renderGlobalBest(globalScoreEl, {
      slug: "honeycomb",
      score: finalElapsedMs,
      isRecord: function (score, best) { return score <= best; },
      label: function (best) { return "Global best " + formatTime(best); },
      recordLabel: "★ New global best time ★",
      pending: "Global best …",
      unavailable: "Global best unavailable",
    });
  }

  function updateHud() {
    timeVal.textContent = formatTime(liveElapsed());
    bestVal.textContent = formatTime(best);
    // Clearing every bomb is the only win, so the count left is the only
    // real progress indicator the board doesn't already show.
    bombsVal.textContent = String(bombsRemaining);
  }

  // "New hive" (top bar) always starts a fresh random puzzle, regardless of
  // how the current run is going.
  function startNewHive() {
    generatePuzzle(false);
  }

  // "Play Again" (end-of-run overlay) replays the same hive unless the
  // player actually won it — losing or settling without clearing every
  // bomb means the puzzle itself is still fair game to retry.
  function playAgain() {
    generatePuzzle(!wonLastRun);
  }

  function updateTagline() {
    if (ended) return;
    tagline.textContent = "Clear every bomb without breaking the hive.";
  }

  // Borrows the tagline to explain a tap that couldn't do anything, then puts
  // it back. Guarded on runToken so it can't overwrite a new hive's tagline.
  var hintTimer = null;
  function showTapHint(msg) {
    if (ended) return;
    tagline.textContent = msg;
    clearTimeout(hintTimer);
    var token = runToken;
    hintTimer = setTimeout(function () {
      if (token !== runToken) return;
      updateTagline();
    }, 2400);
  }

  // ---------- overlay / share / howto ----------
  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  // Every card names its cause. The old overlay gave a title and a time, so a
  // run that ended for a reason the player hadn't noticed just looked like it
  // had stopped on its own.
  function reasonText(reason) {
    if (reason === "cleared") {
      return clearedOnSplit
        ? "The last bomb took the hive apart with it — but every bomb was gone, so the run still counts."
        : "Every bomb cleared, and the hive never came apart.";
    }
    return "That move cut " + plural(lastStrandedCount, "tile") + " loose from the hive — " +
      plural(bombsRemaining, "bomb") + " still live.";
  }

  function showOverlay(reason) {
    var won = reason === "cleared";
    overlay.classList.toggle("won", won);
    // The title names WHAT happened; this names the outcome, so a loss is
    // never left to be inferred from the colour.
    overlayStatus.textContent = won ? "GAME WON" : "GAME LOST";
    overlayTitle.textContent = won ? "ALL CLEAR" : "HIVE SPLIT";
    overlayReason.textContent = reasonText(reason);
    globalScoreEl.hidden = true;
    globalScoreEl.classList.remove("new-global");
    overlaySub.textContent = "Time " + formatTime(finalElapsedMs) + " · Best " + formatTime(best);
    shareNote.classList.remove("show");
    overlay.classList.add("show");
  }
  function hideOverlay() {
    overlay.classList.remove("show", "won");
  }

  function shareResult() {
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    var text = wonLastRun
      ? "I cleared HONEYCOMB in " + formatTime(finalElapsedMs) + ". Can you beat it?"
      : "I lasted " + formatTime(finalElapsedMs) + " in HONEYCOMB before the hive beat me. Can you beat it?";

    if (navigator.share) {
      navigator.share({ title: "Honeycomb", text: text, url: url.toString() }).catch(function () {});
      return;
    }
    var payload = text + " " + url.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(function () {
        note.show("Link copied");
      }).catch(function () {});
    }
  }

  // ---------- interaction (tap only, no drag, no destination choice) ----------
  boardEl.addEventListener("click", function (e) {
    if (ended || moving) return;
    var tileEl = e.target.closest(".tile");
    if (!tileEl) return;
    tapTile(parseInt(tileEl.dataset.id, 10));
  });

  newBtn.addEventListener("click", startNewHive);
  againBtn.addEventListener("click", playAgain);
  var note = createNote(shareNote);

  bindOverlay(overlay, {
    primary: againBtn,
    inertRoot: document.querySelector(".stage"),
    label: "Round over",
  });

  initThemeToggle(themeBtn);

  onSoundChange(function (on) {
    soundBtn.classList.toggle("is-off", !on);
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
  });
  soundBtn.addEventListener("click", function () {
    toggleSound();
    resumeAudio();
  });

  shareBtn.addEventListener("click", shareResult);
  initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });
  // Coalesced to one render a frame: a resize arrives in bursts and
  // renderInstant() rebuilds the whole hive.
  var resizeFrame = 0;
  window.addEventListener("resize", function () {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      renderInstant();
    });
  });

  // The hive is measured against the space left over after the top bar, and
  // the top bar's height depends on a webfont that may still be loading. A
  // font swap does not fire `resize`, so without this the hive keeps whatever
  // size it was given before the swap.
  if (document.fonts) document.fonts.ready.then(renderInstant);

  updateHud();
  generatePuzzle(false);
})();
