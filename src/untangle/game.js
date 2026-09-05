import { initHowto, initShare, bindOverlay } from "../shared/ui/shell.js";
import { tone, initSoundToggle } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { getInt, set as setPref } from "../shared/ui/prefs.js";
import { recordPlay } from "../shared/ui/progress.js";

(function () {
  "use strict";

  var MIN_NODES = 8, MAX_NODES = 13;
  var CHORD_FRACTION_MIN = 0.35, CHORD_FRACTION_MAX = 0.6; // fraction of the n-3 outerplanar chord cap
  var CROSSING_MIN_FACTOR = 0.18, CROSSING_MAX_FACTOR = 0.55; // fraction of edge count
  var FIXED_FRACTION_MIN = 0.25, FIXED_FRACTION_MAX = 0.35;
  var MIN_FREE = 5;    // hard floor on draggable nodes left after fixing some
  var MIN_CLUSTER = 3; // smallest a cluster is allowed to be in the cluster+bridge template
  var GEN_ATTEMPTS = 200;
  var HOME_RADIUS = 0.36; // fraction from board center — the puzzle's canonical circle layout
  var MOVE_RADIUS = 0.41; // fraction from board center — the circular area a node can occupy
  var BEST_KEY = "untangle.best";

  var board = document.getElementById("board");
  var crossingsVal = document.getElementById("crossingsVal");
  var bestVal = document.getElementById("bestVal");
  var resetBtn = document.getElementById("resetBtn");
  var overlay = document.getElementById("overlay");
  var overlaySub = document.getElementById("overlaySub");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var soundBtn = document.getElementById("soundBtn");
  var themeBtn = document.getElementById("themeBtn");

  var nodes = [];       // {x, y} fractions 0..1, index = node id
  var edges = [];       // [a, b] node id pairs
  var fixed = [];       // boolean per node id — true if pinned (not draggable)
  var nodeEls = [];
  var hitEls = [];       // invisible larger circles that own pointer/touch interaction
  var fixedDotEls = [];  // small solid center dot, one per fixed node only (sparse array)
  var edgeEls = [];
  var boundaryEl = null;  // always-visible dashed circle marking the valid move area
  var crossingFlags = []; // reusable per-edge crossing state, sized once in buildDom
  var moves = 0;
  var crossings = 0;   // last rendered count; the HUD is a view of this, never the source
  var startTime = 0;
  var ended = false;
  var best = getInt(BEST_KEY);

  var activePointerId = null;
  var dragIndex = -1;
  var dragMoved = false;
  var dragRect = null;     // board rect cached for the duration of a drag
  var latestX = 0, latestY = 0, rafScheduled = false;
  var wasOutsideBoundary = false; // desktop drag: pulse once per crossing, not every frame held past it
  var selectedIndex = -1;  // tap-to-move selection (touch only)
  var pendingTap = null;   // touch gesture awaiting release: null = none, -1 = on empty board, >=0 = on that node id

  // offsetWidth (the usual force-reflow trick) is undefined on SVG shapes —
  // it silently no-ops there, so a fast repeat trigger fails to restart the
  // animation. getBoundingClientRect() forces a real synchronous reflow on
  // any element, SVG included.
  function triggerShake(el) {
    el.classList.remove("shake");
    void el.getBoundingClientRect();
    el.classList.add("shake");
  }

  function triggerBoundaryPulse() {
    boundaryEl.classList.remove("pulse");
    void boundaryEl.getBoundingClientRect();
    boundaryEl.classList.add("pulse");
  }


  function writeBest(v) {
    best = v;
    setPref(BEST_KEY, v);
  }

  // ---------- audio ----------
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
    var pos = [], R = HOME_RADIUS;
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
    selectedIndex = -1;
    pendingTap = null;
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
    endCard.hide();
  }

  function buildDom() {
    board.innerHTML = "";
    // The dashed valid-move boundary — always visible, framing the area a
    // node can be moved into; sits above the edges but below the nodes/hit
    // targets.
    boundaryEl = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    boundaryEl.setAttribute("class", "move-boundary");
    board.appendChild(boundaryEl);
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
      board.appendChild(el);
      return el;
    });
    nodeEls = nodes.map(function (_, i) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("class", fixed[i] ? "node fixed" : "node");
      board.appendChild(el);
      return el;
    });
    // Fixed nodes get one extra small solid dot centered inside their ring
    // ("bullseye") so they read as pinned in place, not just an empty outline.
    fixedDotEls = [];
    nodes.forEach(function (_, i) {
      if (!fixed[i]) return;
      var el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("class", "node-fixed-dot");
      el.setAttribute("r", 4);
      board.appendChild(el);
      fixedDotEls[i] = el;
    });
    crossingFlags = new Array(edges.length);
  }

  function nodeRadius(rect, n) {
    var base = Math.min(rect.width, rect.height) * 0.05;
    var scaled = base * Math.sqrt(9 / n); // ease crowding as node count grows past the old baseline of ~9
    return Math.max(11, Math.min(22, scaled));
  }

  function hitRadius(r) {
    return Math.max(r + 4, 18); // comfortable touch target without over-claiming board area
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

    boundaryEl.setAttribute("cx", 0.5 * rect.width);
    boundaryEl.setAttribute("cy", 0.5 * rect.height);
    boundaryEl.setAttribute("r", MOVE_RADIUS * Math.min(rect.width, rect.height));

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
      nel.setAttribute("r", (n === dragIndex || n === selectedIndex) ? r + 4 : r);
      var hel = hitEls[n];
      hel.setAttribute("cx", cx);
      hel.setAttribute("cy", cy);
      hel.setAttribute("r", hitR);
      if (fixed[n]) {
        fixedDotEls[n].setAttribute("cx", cx);
        fixedDotEls[n].setAttribute("cy", cy);
      }
    }

    crossings = count;
    crossingsVal.textContent = String(count);
    return count;
  }

  function updateBestHud() {
    bestVal.textContent = best != null ? "Best " + best + (best === 1 ? " move" : " moves") : "";
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Pulls a fraction-space point back onto the circular MOVE_RADIUS boundary
  // around the board's center if it lies outside it (used by desktop drag,
  // which just quietly stays inside it rather than showing the indicator below).
  function clampToBoundary(x, y) {
    var dx = x - 0.5, dy = y - 0.5;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= MOVE_RADIUS) return { x: x, y: y };
    var scale = MOVE_RADIUS / dist;
    return { x: 0.5 + dx * scale, y: 0.5 + dy * scale };
  }

  function withinBoundary(x, y) {
    var dx = x - 0.5, dy = y - 0.5;
    return (dx * dx + dy * dy) <= MOVE_RADIUS * MOVE_RADIUS;
  }

  function showOverlay() {
    overlaySub.textContent = moves + (moves === 1 ? " move" : " moves") +
      " · " + elapsedSeconds() + "s";
    endCard.show();
  }

  function checkSolved(count) {
    if (ended || count !== 0) return;
    ended = true;
    /* Recorded here rather than in showOverlay(), so closing the tab during the
       win animation still fills today's slot. */
    recordPlay("untangle", moves, true);
    if (best == null || moves < best) writeBest(moves);
    updateBestHud();
    sndWin();
    showOverlay();
  }

  updateBestHud();
  generatePuzzle();

  resetBtn.addEventListener("click", generatePuzzle);
  againBtn.addEventListener("click", generatePuzzle);

  initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });

  initShare({
    btn: shareBtn,
    note: shareNote,
    title: "Untangle",
    text: function () {
      var seconds = Math.max(0, Math.round((performance.now() - startTime) / 1000));
      return "I untangled it in " + moves + (moves === 1 ? " move" : " moves") +
        " (" + seconds + "s). Can you untangle yours?";
    },
  });

  // The end card becomes a real dialog: the board behind it leaves the tab
  // order, the reset button stops being clickable through it, focus lands on
  // Again so Enter replays, and Escape dismisses the card to reveal the
  // solved puzzle underneath.
  bindOverlay(overlay, {
    primary: againBtn,
    label: "Game over",
  });

  initThemeToggle(themeBtn);

  initSoundToggle(soundBtn, sndRelease);
  // Coalesced to one render a frame. A resize arrives in bursts — an
  // orientation change, a window drag — and render() measures the board and
  // then rewrites an SVG attribute per node and per edge, which is far too
  // much to run several times inside a single frame.
  var resizeFrame = 0;
  window.addEventListener("resize", function () {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      render();
    });
  });

  // Node positions are measured against the board's box, which sits under a
  // top bar whose height depends on a webfont that may still be loading. A
  // font swap does not fire `resize`, so re-render once it settles.
  if (document.fonts) document.fonts.ready.then(render);

  function clearSelection() {
    if (selectedIndex >= 0) nodeEls[selectedIndex].classList.remove("active");
    selectedIndex = -1;
  }

  function selectNode(idx) {
    clearSelection();
    selectedIndex = idx;
    nodeEls[idx].classList.add("active");
    render();
  }

  function beginDrag(e, el, idx) {
    dragIndex = idx;
    dragMoved = false;
    dragRect = board.getBoundingClientRect();
    wasOutsideBoundary = false;
    board.classList.add("dragging");
    nodeEls[idx].classList.add("active");
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  board.addEventListener("pointerdown", function (e) {
    if (ended || activePointerId !== null) return;
    var isTouch = e.pointerType === "touch";
    var el = e.target.closest(".node-hit");

    if (el) {
      /* hitEls is indexed by node id and is rebuilt whole on every puzzle, so
         its position *is* the id. Reading it back from a data attribute was a
         second copy of that with nothing keeping the two in step. */
      var idx = hitEls.indexOf(el);
      if (fixed[idx]) { triggerShake(nodeEls[idx]); return; }

      activePointerId = e.pointerId;
      if (!isTouch) { beginDrag(e, el, idx); return; } // desktop: unchanged immediate drag

      // Touch: no dragging at all — resolved as a tap-select/deselect/switch
      // in endDrag once the finger lifts, however far it wandered while held
      // (a real finger's natural jitter during a "tap" can easily be several
      // pixels — there's no drag left to disambiguate against, so it must
      // always resolve, never silently drop the tap).
      pendingTap = idx;
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }

    if (!isTouch || selectedIndex < 0) return; // desktop, or nothing to move-to-here
    activePointerId = e.pointerId;
    pendingTap = -1;
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  function applyDragMove() {
    rafScheduled = false;
    if (dragIndex < 0) return; // drag may have already ended before this frame ran
    var rect = dragRect;
    var rawX = (latestX - rect.left) / rect.width, rawY = (latestY - rect.top) / rect.height;
    var outside = !withinBoundary(rawX, rawY);
    if (outside && !wasOutsideBoundary) triggerBoundaryPulse();
    wasOutsideBoundary = outside;
    var p = clampToBoundary(rawX, rawY);
    nodes[dragIndex].x = p.x;
    nodes[dragIndex].y = p.y;
    dragMoved = true;
    /* The previous count used to be re-parsed out of #crossingsVal.textContent
       on every frame of a drag, which made an audio decision depend on a
       rendered string — a copy tweak to the HUD would have become a logic bug.
       render() returns the count, so keep the last one. */
    var before = crossings;
    var after = render();
    if (after < before) sndRelease();
  }

  // Touch never promotes a pending tap into a drag — tap-to-move is the only
  // touch interaction. This only ever drives the desktop mouse drag.
  board.addEventListener("pointermove", function (e) {
    if (e.pointerId !== activePointerId || dragIndex < 0) return;
    latestX = e.clientX;
    latestY = e.clientY;
    if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(applyDragMove); }
  });

  function endDrag(e) {
    if (e.pointerId !== activePointerId) return;

    if (pendingTap !== null) {
      if (pendingTap >= 0) {
        if (selectedIndex === pendingTap) { clearSelection(); render(); }
        else selectNode(pendingTap);
      } else if (selectedIndex >= 0) {
        var rect = board.getBoundingClientRect();
        var idx = selectedIndex;
        var fx = (e.clientX - rect.left) / rect.width;
        var fy = (e.clientY - rect.top) / rect.height;
        if (withinBoundary(fx, fy)) {
          nodes[idx].x = fx;
          nodes[idx].y = fy;
          clearSelection();
          moves++;
          checkSolved(render());
        } else {
          // Outside the valid area: reject the move but keep the node selected
          // so the player can just try again, matching the "invalid action"
          // feedback already used for tapping a fixed node.
          triggerShake(nodeEls[idx]);
          triggerBoundaryPulse();
        }
      }
      pendingTap = null;
      activePointerId = null;
      return;
    }

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
