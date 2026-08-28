(function () {
  "use strict";

  var MIN_NODES = 8, MAX_NODES = 13;
  var CHORD_FRACTION_MIN = 0.35, CHORD_FRACTION_MAX = 0.6; // fraction of the n-3 outerplanar chord cap
  var CROSSING_MIN_FACTOR = 0.18, CROSSING_MAX_FACTOR = 0.55; // fraction of edge count
  var FIXED_FRACTION_MIN = 0.25, FIXED_FRACTION_MAX = 0.35;
  var MIN_FREE = 5;    // hard floor on draggable nodes left after fixing some
  var MIN_CLUSTER = 3; // smallest a cluster is allowed to be in the cluster+bridge template
  var GEN_ATTEMPTS = 200;
  var PAD = 0.09;      // fraction margin nodes can't be dragged past
  var BEST_KEY = "untangleBestMoves";
  var HINT_KEY = "untangleHintSeen";

  var board = document.getElementById("board");
  var crossingsVal = document.getElementById("crossingsVal");
  var bestVal = document.getElementById("bestVal");
  var resetBtn = document.getElementById("resetBtn");
  var overlay = document.getElementById("overlay");
  var overlaySub = document.getElementById("overlaySub");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");

  var nodes = [];       // {x, y} fractions 0..1, index = node id
  var edges = [];       // [a, b] node id pairs
  var fixed = [];       // boolean per node id — true if pinned (not draggable)
  var nodeEls = [];
  var hitEls = [];       // invisible larger circles that own pointer/touch interaction
  var edgeEls = [];
  var crossingFlags = []; // reusable per-edge crossing state, sized once in buildDom
  var moves = 0;
  var startTime = 0;
  var ended = false;
  var best = readBest();

  var activePointerId = null;
  var dragIndex = -1;
  var dragMoved = false;
  var dragRect = null;     // board rect cached for the duration of a drag
  var latestX = 0, latestY = 0, rafScheduled = false;
  var hintCleared = readHintSeen();

  function readHintSeen() {
    try { return localStorage.getItem(HINT_KEY) === "1"; } catch (e) { return true; }
  }

  function clearHint() {
    if (hintCleared) return;
    hintCleared = true;
    try { localStorage.setItem(HINT_KEY, "1"); } catch (e) { /* ignore */ }
    var hinted = board.querySelector(".node.hint");
    if (hinted) hinted.classList.remove("hint");
  }

  function applyHint() {
    if (hintCleared) return;
    var idx = edgeEls.findIndex(function (el, i) {
      if (!el.classList.contains("crossing")) return false;
      var pair = edges[i];
      return !fixed[pair[0]] || !fixed[pair[1]];
    });
    var nodeIndex = -1;
    if (idx >= 0) {
      var pair = edges[idx];
      nodeIndex = !fixed[pair[0]] ? pair[0] : pair[1];
    } else {
      for (var i2 = 0; i2 < nodes.length; i2++) {
        if (!fixed[i2]) { nodeIndex = i2; break; }
      }
    }
    if (nodeIndex >= 0) nodeEls[nodeIndex].classList.add("hint");
  }

  function triggerShake(el) {
    el.classList.remove("shake");
    void el.offsetWidth; // force reflow so a repeat tap can retrigger the animation
    el.classList.add("shake");
  }

  function readBest() {
    try {
      var v = localStorage.getItem(BEST_KEY);
      return v ? parseInt(v, 10) : null;
    } catch (e) { return null; }
  }

  function writeBest(v) {
    best = v;
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
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
  function tone(freq, dur, type, gain) {
    try {
      var c = ctx();
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(g).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch (e) { /* audio not available, ignore */ }
  }
  function sndRelease() { tone(720, 0.09, "sine", 0.05); }
  function sndWin() {
    tone(660, 0.12, "sine", 0.06);
    setTimeout(function () { tone(880, 0.16, "sine", 0.06); }, 90);
  }

  // ---------- geometry ----------
  function orient(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }
  function segmentsCross(p1, p2, p3, p4) {
    var d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2);
    var d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  // Do chords (a,b) and (c,d) interleave around the cycle? (exactly one of c,d
  // strictly between a and b). Used to keep the graph outerplanar so a
  // crossing-free circle layout always exists, even once some nodes are pinned.
  function chordsCross(a, b, c, d) {
    var lo1 = Math.min(a, b), hi1 = Math.max(a, b);
    var lo2 = Math.min(c, d), hi2 = Math.max(c, d);
    var cIn = lo2 > lo1 && lo2 < hi1;
    var dIn = hi2 > lo1 && hi2 < hi1;
    return cIn !== dIn;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function circlePositions(n) {
    var pos = [], R = 0.36;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 - Math.PI / 2;
      pos.push({ x: 0.5 + R * Math.cos(a), y: 0.5 + R * Math.sin(a) });
    }
    return pos;
  }

  // Non-adjacent id pairs (cyclic gap > 1) — the shared candidate pool for any
  // chord/diagonal search among ids 0..n-1 in circle order.
  function nonAdjacentPairs(n) {
    var candidates = [];
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        var d = Math.min(b - a, n - (b - a));
        if (d > 1) candidates.push([a, b]);
      }
    }
    return candidates;
  }

  function chordTarget(maxChords) {
    var fraction = CHORD_FRACTION_MIN + Math.random() * (CHORD_FRACTION_MAX - CHORD_FRACTION_MIN);
    return Math.min(maxChords, Math.round(maxChords * fraction));
  }

  // Picks one of three structural "personalities" for the puzzle's graph.
  // Every template returns { edges, anchors } — anchors are node ids that
  // should be preferentially fixed (see generatePuzzle) because they're the
  // structurally important points (a hub, or a bridge between clusters).
  function buildGraph(n) {
    var roll = Math.random();
    if (roll < 0.4) return buildUniformGraph(n);
    if (roll < 0.7) return buildHubGraph(n);
    return buildClusterGraph(n);
  }

  // Today's original behavior: a ring plus uniformly-random non-crossing chords.
  function buildUniformGraph(n) {
    var e = [];
    for (var i = 0; i < n; i++) e.push([i, (i + 1) % n]);

    var candidates = nonAdjacentPairs(n);
    shuffle(candidates);
    var target = chordTarget(n - 3); // outerplanar cap: a convex n-gon has at most n-3 non-crossing diagonals

    var chords = [];
    for (var c = 0; c < candidates.length && chords.length < target; c++) {
      var cand = candidates[c], ok = true;
      for (var j = 0; j < chords.length; j++) {
        if (chordsCross(cand[0], cand[1], chords[j][0], chords[j][1])) { ok = false; break; }
      }
      if (ok) { chords.push(cand); e.push(cand); }
    }
    return { edges: e, anchors: [] };
  }

  // One node (the hub) soaks up most of the chord budget, so it ends up with
  // noticeably more connections than everyone else — a clear structural role.
  function buildHubGraph(n) {
    var e = [];
    for (var i = 0; i < n; i++) e.push([i, (i + 1) % n]);
    var hub = Math.floor(Math.random() * n);

    var candidates = nonAdjacentPairs(n);
    var hubCands = candidates.filter(function (p) { return p[0] === hub || p[1] === hub; });
    var otherCands = candidates.filter(function (p) { return p[0] !== hub && p[1] !== hub; });
    shuffle(hubCands);
    shuffle(otherCands);

    var target = chordTarget(n - 3);
    var hubBudget = Math.max(1, Math.round(target * 0.6));

    var chords = [];
    function tryAdd(cand) {
      for (var j = 0; j < chords.length; j++) {
        if (chordsCross(cand[0], cand[1], chords[j][0], chords[j][1])) return false;
      }
      chords.push(cand); e.push(cand); return true;
    }
    var used = 0, added = 0;
    for (; used < hubCands.length && added < hubBudget; used++) {
      if (tryAdd(hubCands[used])) added++;
    }
    var rest = hubCands.slice(used).concat(otherCands);
    shuffle(rest);
    for (var c = 0; c < rest.length && chords.length < target; c++) tryAdd(rest[c]);

    return { edges: e, anchors: [hub] };
  }

  // Splits the ring into 2 (usually) or 3 (sometimes) contiguous clusters,
  // each densely connected internally, joined only by the single path edge at
  // each seam — no chord is ever added between clusters, so the graph reads
  // as distinct local groups rather than one uniform blob.
  function buildClusterGraph(n) {
    var wantThree = n >= 3 * MIN_CLUSTER && Math.random() < 0.3;
    var cuts = wantThree ? pickTwoCuts(n) : [pickOneCut(n)];

    var e = [];
    for (var i = 0; i < n - 1; i++) e.push([i, i + 1]); // open path — no wraparound edge

    var bounds = [0].concat(cuts).concat([n]);
    for (var k = 0; k < bounds.length - 1; k++) {
      addClusterChords(e, bounds[k], bounds[k + 1] - 1);
    }

    var anchors = [];
    for (var c = 0; c < cuts.length; c++) anchors.push(cuts[c] - 1, cuts[c]);
    return { edges: e, anchors: anchors };
  }

  function pickOneCut(n) {
    return MIN_CLUSTER + Math.floor(Math.random() * (n - 2 * MIN_CLUSTER + 1));
  }

  function pickTwoCuts(n) {
    var first = MIN_CLUSTER + Math.floor(Math.random() * (n - 3 * MIN_CLUSTER + 1));
    var second = first + MIN_CLUSTER + Math.floor(Math.random() * (n - first - 2 * MIN_CLUSTER + 1));
    return [first, second];
  }

  // Adds non-crossing diagonals within one cluster's id range [lo, hi] only —
  // never between clusters, so bridges stay singular.
  function addClusterChords(e, lo, hi) {
    var size = hi - lo + 1;
    var maxChords = size - 3;
    if (maxChords <= 0) return;

    var candidates = [];
    for (var a = lo; a <= hi; a++) {
      for (var b = a + 1; b <= hi; b++) {
        if (b - a > 1) candidates.push([a, b]);
      }
    }
    shuffle(candidates);
    var target = chordTarget(maxChords);

    var added = 0;
    for (var c = 0; c < candidates.length && added < target; c++) {
      var cand = candidates[c], ok = true;
      for (var j = 0; j < e.length; j++) {
        if (chordsCross(cand[0], cand[1], e[j][0], e[j][1])) { ok = false; break; }
      }
      if (ok) { e.push(cand); added++; }
    }
  }

  // Shared by puzzle generation (count only) and render() (count + per-edge
  // flags, via the optional flagsOut array) — one implementation instead of
  // two near-identical double loops.
  function computeCrossings(pos, e, flagsOut) {
    var count = 0;
    for (var i = 0; i < e.length; i++) {
      var crossing = false;
      for (var j = 0; j < e.length; j++) {
        if (i === j) continue;
        var a = e[i], b = e[j];
        if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
        if (segmentsCross(pos[a[0]], pos[a[1]], pos[b[0]], pos[b[1]])) { crossing = true; break; }
      }
      if (flagsOut) flagsOut[i] = crossing;
      if (crossing) count++;
    }
    return count;
  }

  function generatePuzzle() {
    var n = MIN_NODES + Math.floor(Math.random() * (MAX_NODES - MIN_NODES + 1));
    var built = buildGraph(n);
    edges = built.edges;
    var anchors = built.anchors; // ids that should be preferentially fixed (hub, bridge endpoints, or none)
    var slots = circlePositions(n);

    var ids = [];
    for (var i = 0; i < n; i++) if (anchors.indexOf(i) === -1) ids.push(i);
    shuffle(ids);
    var fixedFraction = FIXED_FRACTION_MIN + Math.random() * (FIXED_FRACTION_MAX - FIXED_FRACTION_MIN);
    var fixedCount = clamp(Math.max(Math.round(n * fixedFraction), anchors.length), anchors.length, n - MIN_FREE);
    var fixedIds = anchors.concat(ids.slice(0, fixedCount - anchors.length));
    var freeIds = ids.slice(fixedCount - anchors.length);

    fixed = [];
    for (var k = 0; k < n; k++) fixed[k] = false;
    for (var f = 0; f < fixedIds.length; f++) fixed[fixedIds[f]] = true;

    var E = edges.length;
    var minCrossings = Math.max(2, Math.round(CROSSING_MIN_FACTOR * E));
    var maxCrossings = Math.max(minCrossings + 4, Math.round(CROSSING_MAX_FACTOR * E));

    var chosen = null, fallback = null, fallbackDiff = Infinity;
    for (var attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
      var scrambledFree = shuffle(freeIds.slice());
      var positions = new Array(n);
      for (var fi = 0; fi < fixedIds.length; fi++) positions[fixedIds[fi]] = slots[fixedIds[fi]];
      for (var fj = 0; fj < freeIds.length; fj++) positions[freeIds[fj]] = slots[scrambledFree[fj]];

      var c = computeCrossings(positions, edges);
      if (c >= minCrossings && c <= maxCrossings) { chosen = positions; break; }
      var diff = c < minCrossings ? minCrossings - c : c - maxCrossings;
      if (diff < fallbackDiff) { fallbackDiff = diff; fallback = positions; }
    }
    var picked = chosen || fallback;
    nodes = picked.map(function (p) { return { x: p.x, y: p.y }; });

    moves = 0;
    ended = false;
    startTime = performance.now();
    buildDom();
    render();
    applyHint();
    hideOverlay();
  }

  function buildDom() {
    board.innerHTML = "";
    edgeEls = edges.map(function () {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "line");
      el.setAttribute("class", "edge");
      board.appendChild(el);
      return el;
    });
    // Each node is two circles: an invisible larger one that owns all pointer/touch
    // interaction (so grabbing a node doesn't need pixel-perfect finger placement),
    // and the small visible dot on top, purely decorative (pointer-events: none).
    hitEls = nodes.map(function (_, i) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("class", "node-hit");
      el.dataset.index = i;
      board.appendChild(el);
      return el;
    });
    nodeEls = nodes.map(function (_, i) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("class", fixed[i] ? "node fixed" : "node");
      el.dataset.index = i;
      board.appendChild(el);
      return el;
    });
    crossingFlags = new Array(edges.length);
  }

  function nodeRadius(rect, n) {
    var base = Math.min(rect.width, rect.height) * 0.05;
    var scaled = base * Math.sqrt(9 / n); // ease crowding as node count grows past the old baseline of ~9
    return Math.max(11, Math.min(22, scaled));
  }

  function hitRadius(r) {
    return Math.max(r + 6, 22); // comfortable touch target regardless of the visual dot's size
  }

  function render() {
    // Reuse the rect cached at drag start instead of re-querying layout on
    // every single pointermove — the board can't resize mid-drag (window
    // resize is handled separately below). Kept as a zero-arg function since
    // it's also registered directly as the "resize" event listener.
    var rect = (dragIndex >= 0 && dragRect) ? dragRect : board.getBoundingClientRect();
    var r = nodeRadius(rect, nodes.length);
    var hitR = hitRadius(r);

    var count = computeCrossings(nodes, edges, crossingFlags);

    for (var e = 0; e < edges.length; e++) {
      var pair = edges[e], p1 = nodes[pair[0]], p2 = nodes[pair[1]];
      var el = edgeEls[e];
      el.setAttribute("x1", p1.x * rect.width);
      el.setAttribute("y1", p1.y * rect.height);
      el.setAttribute("x2", p2.x * rect.width);
      el.setAttribute("y2", p2.y * rect.height);
      el.classList.toggle("crossing", crossingFlags[e]);
    }

    for (var n = 0; n < nodes.length; n++) {
      var cx = nodes[n].x * rect.width, cy = nodes[n].y * rect.height;
      var nel = nodeEls[n];
      nel.setAttribute("cx", cx);
      nel.setAttribute("cy", cy);
      nel.setAttribute("r", n === dragIndex ? r + 4 : r);
      var hel = hitEls[n];
      hel.setAttribute("cx", cx);
      hel.setAttribute("cy", cy);
      hel.setAttribute("r", hitR);
    }

    crossingsVal.textContent = String(count);
    return count;
  }

  function updateBestHud() {
    bestVal.textContent = best != null ? "Best " + best + (best === 1 ? " move" : " moves") : "";
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function showOverlay() {
    var seconds = Math.max(0, Math.round((performance.now() - startTime) / 1000));
    overlaySub.textContent = moves + (moves === 1 ? " move" : " moves") + " · " + seconds + "s";
    shareNote.classList.remove("show");
    overlay.classList.add("show");
  }

  function hideOverlay() {
    overlay.classList.remove("show");
  }

  function checkSolved(count) {
    if (ended || count !== 0) return;
    ended = true;
    if (best == null || moves < best) writeBest(moves);
    updateBestHud();
    sndWin();
    showOverlay();
  }

  function shareResult() {
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    var seconds = Math.max(0, Math.round((performance.now() - startTime) / 1000));
    var text = "I untangled it in " + moves + (moves === 1 ? " move" : " moves") +
      " (" + seconds + "s). Can you untangle yours?";

    if (navigator.share) {
      navigator.share({ title: "Untangle", text: text, url: url.toString() }).catch(function () {});
      return;
    }
    var payload = text + " " + url.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(function () {
        shareNote.classList.add("show");
      }).catch(function () {});
    }
  }

  updateBestHud();
  generatePuzzle();

  resetBtn.addEventListener("click", generatePuzzle);
  againBtn.addEventListener("click", generatePuzzle);
  shareBtn.addEventListener("click", shareResult);
  window.addEventListener("resize", render);

  board.addEventListener("pointerdown", function (e) {
    if (ended || activePointerId !== null) return;
    var el = e.target.closest(".node-hit");
    if (!el) return;
    var idx = parseInt(el.dataset.index, 10);
    clearHint(); // any interaction attempt counts as "the player found the dots"
    if (fixed[idx]) { triggerShake(nodeEls[idx]); return; }
    activePointerId = e.pointerId;
    dragIndex = idx;
    dragMoved = false;
    dragRect = board.getBoundingClientRect();
    board.classList.add("dragging");
    nodeEls[idx].classList.add("active");
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  function applyDragMove() {
    rafScheduled = false;
    if (dragIndex < 0) return; // drag may have already ended before this frame ran
    var rect = dragRect;
    nodes[dragIndex].x = clamp((latestX - rect.left) / rect.width, PAD, 1 - PAD);
    nodes[dragIndex].y = clamp((latestY - rect.top) / rect.height, PAD, 1 - PAD);
    dragMoved = true;
    var before = parseInt(crossingsVal.textContent, 10);
    var after = render();
    if (after < before) sndRelease();
  }

  board.addEventListener("pointermove", function (e) {
    if (e.pointerId !== activePointerId || dragIndex < 0) return;
    latestX = e.clientX;
    latestY = e.clientY;
    if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(applyDragMove); }
  });

  function endDrag(e) {
    if (e.pointerId !== activePointerId) return;
    if (dragIndex >= 0) nodeEls[dragIndex].classList.remove("active");
    board.classList.remove("dragging");
    dragRect = null;
    if (dragMoved) {
      moves++;
      checkSolved(render());
    }
    activePointerId = null;
    dragIndex = -1;
  }

  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
})();
