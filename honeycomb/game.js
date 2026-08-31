(function () {
  "use strict";

  var MIN_TILES = 20, MAX_TILES = 28;
  var REVEAL_MIN = 0.4, REVEAL_MAX = 0.5;
  var MIN_REVEALED_EDGE = 2; // guarantees a legible first move
  var MIN_MOVABLE_EDGE = 3;  // guarantees the player always has moves to make
  var MIN_HEX = 22, MAX_HEX = 56; // px clamp on the hex "radius" (center to vertex)
  var BEST_KEY = "honeycombBestScore";
  // Flat-top axial neighbour offsets.
  var NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // Same six offsets, in a fixed clockwise scan order starting at 12 o'clock —
  // this is the deterministic "which open side does a tapped tile slide into" rule.
  var CLOCKWISE_DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  var FLASH_MS = 150;
  var BLAST_MS = 400;
  var BOMB_DENSITY = 0.22; // fraction of total tiles that are bombs — deliberately generous
  var MIN_BOMBS = 4;
  var MIN_CLUE = 1, MAX_CLUE = 4; // a revealed tile's number is always in this range
  var GEN_ATTEMPTS = 40; // bomb-layout retries, hunting for enough tiles in [MIN_CLUE, MAX_CLUE]

  // Real values live in config.js, which is gitignored and never committed.
  // See config.example.js for the template and README-supabase.sql for setup.
  var SUPABASE_URL = (window.TWB_CONFIG && window.TWB_CONFIG.SUPABASE_URL) || "";
  var SUPABASE_ANON_KEY = (window.TWB_CONFIG && window.TWB_CONFIG.SUPABASE_ANON_KEY) || "";

  function supabaseConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  // Calls the submit_honeycomb_score(new_score) RPC, which atomically raises
  // the single shared row only if this score beats it, and always returns the
  // current global best. Returns null if unconfigured or the request fails.
  function submitGlobalScore(score) {
    if (!supabaseConfigured()) return Promise.resolve(null);
    return fetch(SUPABASE_URL + "/rest/v1/rpc/submit_honeycomb_score", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ new_score: score }),
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      return typeof data === "number" ? data : null;
    }).catch(function () { return null; });
  }

  var boardEl = document.getElementById("board");
  var tagline = document.getElementById("tagline");
  var scoreVal = document.getElementById("scoreVal");
  var bestVal = document.getElementById("bestVal");
  var newBtn = document.getElementById("newBtn");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlaySub = document.getElementById("overlaySub");
  var globalScoreEl = document.getElementById("globalScoreEl");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");

  var tiles = [];         // [{id, q, r, revealed, bomb, removed}]
  var posMap = new Map(); // "q,r" -> tile id
  var tileEls = [];       // id-indexed { wrap, hex, label }
  var score = 0;
  var ended = false;
  var moving = false;     // guards against a second tap landing mid-flash/blast
  var bombsRemaining = 0;
  var best = readBest();

  // ---------- persistence ----------
  function readBest() {
    try {
      var v = localStorage.getItem(BEST_KEY);
      return v ? parseInt(v, 10) : 0;
    } catch (e) { return 0; }
  }
  function writeBest(v) {
    best = v;
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }

  // ---------- hex math (axial, flat-top) ----------
  function key(q, r) { return q + "," + r; }
  function parseKey(k) {
    var parts = k.split(",");
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }
  function unitX(q) { return 1.5 * q; }
  function unitY(q, r) { return Math.sqrt(3) * (r + q / 2); }

  function degreeAt(q, r) {
    var n = 0;
    for (var i = 0; i < NEIGHBORS.length; i++) {
      if (posMap.has(key(q + NEIGHBORS[i][0], r + NEIGHBORS[i][1]))) n++;
    }
    return n;
  }

  // What a revealed tile displays: how many of its 6 neighbors are bombs —
  // not how many neighbors it has. Occupancy (degreeAt) still drives
  // movability/connectivity; this is purely the Minesweeper-style clue.
  function bombCountAt(q, r) {
    var n = 0;
    for (var i = 0; i < NEIGHBORS.length; i++) {
      var nk = key(q + NEIGHBORS[i][0], r + NEIGHBORS[i][1]);
      var neighborId = posMap.get(nk);
      if (neighborId !== undefined && tiles[neighborId].bomb) n++;
    }
    return n;
  }

  // Numbered (revealed) tiles are permanent landmarks — they never move,
  // only their number does, as the hidden tiles around them shift. Only a
  // hidden, not-yet-blasted tile with an open side is ever a legal tap target.
  function isMovable(tile) {
    return !tile.removed && !tile.revealed && degreeAt(tile.q, tile.r) < 6;
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

  // Only builds a fresh random hive — generatePuzzle() below decides whether
  // to call this or replay the last one instead.
  function buildRandomTiles() {
    tiles = [];
    posMap = new Map();

    var targetCount = MIN_TILES + Math.floor(Math.random() * (MAX_TILES - MIN_TILES + 1));
    var occupied = new Set(["0,0"]);
    posMap.set("0,0", 0);
    tiles.push({ id: 0, q: 0, r: 0, revealed: false, bomb: false, removed: false });

    var frontier = new Set();
    addFrontier(0, 0, occupied, frontier);
    var nextId = 1;
    while (occupied.size < targetCount && frontier.size > 0) {
      var arr = Array.from(frontier);
      var pick = arr[Math.floor(Math.random() * arr.length)];
      frontier.delete(pick);
      if (occupied.has(pick)) continue;
      occupied.add(pick);
      var qr = parseKey(pick);
      posMap.set(pick, nextId);
      tiles.push({ id: nextId, q: qr[0], r: qr[1], revealed: false, bomb: false, removed: false });
      nextId++;
      addFrontier(qr[0], qr[1], occupied, frontier);
    }

    // Bombs are placed first — a revealed tile's number depends on them, and
    // must always land in [MIN_CLUE, MAX_CLUE], so which tiles even *can* be
    // revealed is decided after the bomb layout, not before it.
    var bombCount = Math.min(tiles.length - 1, Math.max(MIN_BOMBS, Math.round(tiles.length * BOMB_DENSITY)));
    placeBombs(bombCount);
    bombsRemaining = bombOrder.length;

    var eligible = tiles.filter(isEligibleClue);
    var revealFraction = REVEAL_MIN + Math.random() * (REVEAL_MAX - REVEAL_MIN);
    var revealCount = Math.min(eligible.length, Math.round(tiles.length * revealFraction));
    var order = shuffle(eligible.slice());
    for (var i = 0; i < revealCount; i++) order[i].revealed = true;

    ensureRevealedEdgeTiles(MIN_REVEALED_EDGE);
    // Runs last so it's the final word — movability is the hard requirement,
    // the legibility pass above is just a nicety and must not undo it.
    ensureMovableEdgeTiles(MIN_MOVABLE_EDGE);

    // Fairness: never let every currently-tappable tile be a bomb. Trimming
    // off the END of the verified-safe removal order is the only edit that
    // can't break the solvability guarantee for whatever bombs remain —
    // every earlier removal's safety was already checked in a graph where
    // this last-peeled one was still present, so simply never removing it
    // reproduces exactly those same verified states.
    while (bombOrder.length > 0) {
      var openingMoves = tiles.filter(isMovable);
      var allBombs = openingMoves.length > 0 && openingMoves.every(function (t) { return t.bomb; });
      if (!allBombs) break;
      var droppedKey = bombOrder.pop();
      tiles[posMap.get(droppedKey)].bomb = false;
      bombsRemaining--;
    }
  }

  // reuseBoard: replay the exact hive from the last run instead of building
  // a new random one — used for "Play Again" after a loss, so the player
  // can try the same puzzle again with what they've learned.
  function generatePuzzle(reuseBoard) {
    moving = false;
    if (reuseBoard && lastBoardSnapshot) {
      restoreSnapshot(lastBoardSnapshot);
    } else {
      buildRandomTiles();
      lastBoardSnapshot = snapshotTiles();
    }

    score = 0;
    ended = false;
    buildDom();
    render();
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

  // Same neighbor-walk as degreeAt, but against an arbitrary set of keys
  // instead of the live posMap — used while searching candidate bomb
  // layouts on a throwaway copy of the hive.
  function degreeInKeySet(k, keySet) {
    var qr = parseKey(k);
    var n = 0;
    for (var i = 0; i < NEIGHBORS.length; i++) {
      if (keySet.has(key(qr[0] + NEIGHBORS[i][0], qr[1] + NEIGHBORS[i][1]))) n++;
    }
    return n;
  }

  // Every connected graph with 2+ nodes has at least one vertex whose
  // removal keeps it connected (a leaf of any spanning tree, for one) — so
  // this can always peel off `bombCount` tiles one at a time, each chosen
  // to be both tappable (open side) and safe to remove from whatever's left
  // at that point. The order they're peeled in is, by construction, a
  // verified-safe removal order: isConnected(map) here works the same as it
  // does on the live posMap, since it only relies on Map-shaped methods a
  // plain Set also has.
  function pickSolvableBombOrder(bombCount, allKeys) {
    var working = new Set(allKeys);
    var order = [];
    for (var i = 0; i < bombCount; i++) {
      var candidates = [];
      working.forEach(function (k) {
        if (degreeInKeySet(k, working) >= 6) return;
        var trial = new Set(working);
        trial.delete(k);
        if (isConnected(trial)) candidates.push(k);
      });
      if (candidates.length === 0) break;
      var chosen = candidates[Math.floor(Math.random() * candidates.length)];
      order.push(chosen);
      working.delete(chosen);
    }
    return order;
  }

  // Tries several verified-solvable bomb layouts and keeps whichever gives
  // the most tiles a shot at being revealed (see isEligibleClue) — this is
  // what "design the hive structure" around the 1-4 clue rule actually
  // means: don't settle for a layout that leaves almost nothing revealable.
  // bombOrder (module-level) is kept around so the fairness step below can
  // trim it without breaking the solvability guarantee — see its comment.
  var bombOrder = [];
  function placeBombs(bombCount) {
    var allKeys = tiles.map(function (t) { return key(t.q, t.r); });
    var targetEligible = Math.max(MIN_REVEALED_EDGE, Math.round(tiles.length * 0.3));
    var bestOrder = [], bestEligible = -1;
    for (var attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
      var candidateOrder = pickSolvableBombOrder(bombCount, allKeys);
      var bombKeys = new Set(candidateOrder);
      tiles.forEach(function (t) { t.bomb = bombKeys.has(key(t.q, t.r)); });
      var eligibleCount = tiles.filter(isEligibleClue).length;
      if (eligibleCount > bestEligible) {
        bestEligible = eligibleCount;
        bestOrder = candidateOrder;
      }
      if (eligibleCount >= targetEligible) break;
    }
    bombOrder = bestOrder;
    var finalBombKeys = new Set(bombOrder);
    tiles.forEach(function (t) { t.bomb = finalBombKeys.has(key(t.q, t.r)); });
  }

  function addFrontier(q, r, occupied, frontier) {
    for (var i = 0; i < NEIGHBORS.length; i++) {
      var k = key(q + NEIGHBORS[i][0], r + NEIGHBORS[i][1]);
      if (!occupied.has(k)) frontier.add(k);
    }
  }

  function ensureRevealedEdgeTiles(minCount) {
    var edgeTiles = tiles.filter(function (t) { return degreeAt(t.q, t.r) < 6; });
    var revealedEdge = edgeTiles.filter(function (t) { return t.revealed; });
    if (revealedEdge.length >= minCount) return;
    var candidatesLeft = shuffle(edgeTiles.filter(function (t) { return !t.revealed && isEligibleClue(t); }));
    var need = minCount - revealedEdge.length;
    for (var i = 0; i < need && i < candidatesLeft.length; i++) candidatesLeft[i].revealed = true;
  }

  function ensureMovableEdgeTiles(minCount) {
    var edgeTiles = tiles.filter(function (t) { return degreeAt(t.q, t.r) < 6; });
    var movable = edgeTiles.filter(isMovable);
    if (movable.length >= minCount) return;
    var flippable = shuffle(edgeTiles.filter(function (t) { return t.revealed; }));
    var need = minCount - movable.length;
    for (var i = 0; i < need && i < flippable.length; i++) flippable[i].revealed = false;
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
      return { wrap: wrap, rim: rim, hex: hex, label: label };
    });
  }

  function computeLayout() {
    var minUX = Infinity, maxUX = -Infinity, minUY = Infinity, maxUY = -Infinity;
    posMap.forEach(function (_, k) {
      var qr = parseKey(k);
      var x = unitX(qr[0]), y = unitY(qr[0], qr[1]);
      if (x < minUX) minUX = x;
      if (x > maxUX) maxUX = x;
      if (y < minUY) minUY = y;
      if (y > maxUY) maxUY = y;
    });

    var rect = boardEl.parentElement.getBoundingClientRect();
    var gridWUnits = (maxUX - minUX) + 2;
    var gridHUnits = (maxUY - minUY) + Math.sqrt(3);
    var size = Math.min(rect.width / gridWUnits, rect.height / gridHUnits);
    size = Math.max(MIN_HEX, Math.min(MAX_HEX, size));

    return { size: size, minUX: minUX, minUY: minUY, w: gridWUnits * size, h: gridHUnits * size };
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
      el.wrap.classList.toggle("tile--movable", isMovable(t));
      if (t.revealed) {
        el.label.textContent = String(bombCountAt(t.q, t.r));
        el.wrap.removeAttribute("data-hidden");
      } else {
        // Blank, not "?" — hidden tiles are never revealed by anything the
        // player does, so a "?" mark (implying an eventual reveal) would be
        // misleading. The colour alone marks a tile as hidden.
        el.label.textContent = "";
        el.wrap.setAttribute("data-hidden", "true");
      }
    });
  }

  function triggerShake(el) {
    el.classList.remove("shake");
    void el.getBoundingClientRect();
    el.classList.add("shake");
  }

  // ---------- deterministic move resolution ----------
  // An edge tile (degree < 6) always has at least one open side, so this
  // always finds a destination — the whole point is that it never asks the
  // player to choose one.
  function resolveDestination(tile) {
    for (var i = 0; i < CLOCKWISE_DIRS.length; i++) {
      var d = CLOCKWISE_DIRS[i];
      var k = key(tile.q + d[0], tile.r + d[1]);
      if (!posMap.has(k)) return k;
    }
    return null;
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
    if (!isMovable(tile)) { triggerShake(tileEls[id].wrap); return; }

    if (tile.bomb) { blastTile(id); return; }

    var destKey = resolveDestination(tile);
    moving = true;
    var flash = showFlash(destKey);
    setTimeout(function () {
      flash.remove();
      commitMove(id, destKey);
      moving = false;
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
    boardEl.appendChild(wrap);
    return wrap;
  }

  function blastTile(id) {
    moving = true;
    var tile = tiles[id];
    tileEls[id].wrap.classList.add("blasted");
    var burst = showBurst(tile.q, tile.r);
    setTimeout(function () {
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

    if (connected) {
      score++;
      updateHud();
      if (bombsRemaining === 0) { handleCleared(); return; }
      if (!tiles.some(isMovable)) handleSettled();
    } else {
      handleBreak(newPosMap, newPosMap.keys().next().value);
    }
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

    render();

    if (connected) {
      score++;
      updateHud();
      if (!tiles.some(isMovable)) handleSettled();
    } else {
      handleBreak(newPosMap, destKey);
    }
  }

  function handleSettled() {
    tagline.textContent = "The hive has settled.";
    ended = true;
    setTimeout(function () { endRun("settled"); }, 300);
  }

  function handleCleared() {
    tagline.textContent = "Every bomb is gone.";
    ended = true;
    setTimeout(function () { endRun("cleared"); }, 300);
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
    tiles.forEach(function (t) {
      if (t.removed) return;
      if (!seen.has(key(t.q, t.r))) tileEls[t.id].wrap.classList.add("stranded");
    });
    tagline.textContent = "The hive split apart.";
    ended = true;
    setTimeout(function () { endRun("broken"); }, 650);
  }

  function endRun(reason) {
    wonLastRun = reason === "cleared";
    if (score > best) writeBest(score);
    updateHud();
    showOverlay(reason);
    submitGlobalScore(score).then(function (globalBest) {
      if (globalBest === null) {
        globalScoreEl.hidden = false;
        globalScoreEl.textContent = "GLOBAL BEST UNAVAILABLE";
        return;
      }
      var isNew = score > 0 && score >= globalBest;
      globalScoreEl.hidden = false;
      globalScoreEl.textContent = isNew ? "★ NEW GLOBAL HIGH SCORE ★" : "Global best " + globalBest;
      globalScoreEl.classList.toggle("new-global", isNew);
    });
  }

  function updateHud() {
    scoreVal.textContent = String(score);
    bestVal.textContent = String(best);
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

  // ---------- overlay / share / howto ----------
  function showOverlay(reason) {
    var success = reason === "settled" || reason === "cleared";
    overlay.classList.toggle("settled", success);
    overlayTitle.textContent =
      reason === "cleared" ? "ALL CLEAR" :
      reason === "settled" ? "HIVE SETTLED" :
      "PATTERN BROKEN";
    globalScoreEl.hidden = true;
    globalScoreEl.classList.remove("new-global");
    overlaySub.textContent = "Score " + score + " · Best " + best;
    shareNote.classList.remove("show");
    overlay.classList.add("show");
  }
  function hideOverlay() {
    overlay.classList.remove("show", "settled");
  }

  function shareResult() {
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    var text = "I kept my HONEYCOMB hive connected for " + score + (score === 1 ? " move" : " moves") +
      ". Can you beat it?";

    if (navigator.share) {
      navigator.share({ title: "Honeycomb", text: text, url: url.toString() }).catch(function () {});
      return;
    }
    var payload = text + " " + url.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(function () {
        shareNote.classList.add("show");
      }).catch(function () {});
    }
  }

  function openHowto() {
    howtoSheet.classList.add("show");
    howtoBackdrop.classList.add("show");
  }
  function closeHowto() {
    howtoSheet.classList.remove("show");
    howtoBackdrop.classList.remove("show");
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
  shareBtn.addEventListener("click", shareResult);
  howtoBtn.addEventListener("click", openHowto);
  howtoBackdrop.addEventListener("click", closeHowto);
  window.addEventListener("resize", function () { render(); });

  updateHud();
  generatePuzzle(false);
})();
