(function () {
  "use strict";

  var MIN_NODES = 8, MAX_NODES = 13;
  var CHORD_FRACTION_MIN = 0.35, CHORD_FRACTION_MAX = 0.6; // fraction of the n-3 outerplanar chord cap
  var CROSSING_MIN_FACTOR = 0.18, CROSSING_MAX_FACTOR = 0.55; // fraction of edge count
  var FIXED_FRACTION_MIN = 0.25, FIXED_FRACTION_MAX = 0.35;
  var MIN_FREE = 5;    // hard floor on draggable nodes left after fixing some
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
  var edgeEls = [];
  var moves = 0;
  var startTime = 0;
  var ended = false;
  var best = readBest();

  var activePointerId = null;
  var dragIndex = -1;
  var dragMoved = false;
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

  function buildGraph(n) {
    var e = [];
    for (var i = 0; i < n; i++) e.push([i, (i + 1) % n]);

    var candidates = [];
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        var d = Math.min(b - a, n - (b - a));
        if (d > 1) candidates.push([a, b]);
      }
    }
    shuffle(candidates);

    var maxChords = n - 3; // outerplanar cap: a convex n-gon has at most n-3 non-crossing diagonals
    var fraction = CHORD_FRACTION_MIN + Math.random() * (CHORD_FRACTION_MAX - CHORD_FRACTION_MIN);
    var target = Math.min(maxChords, Math.round(maxChords * fraction));

    var chords = [];
    for (var c = 0; c < candidates.length && chords.length < target; c++) {
      var cand = candidates[c], ok = true;
      for (var j = 0; j < chords.length; j++) {
        if (chordsCross(cand[0], cand[1], chords[j][0], chords[j][1])) { ok = false; break; }
      }
      if (ok) { chords.push(cand); e.push(cand); }
    }
    return e;
  }

  function countCrossings(pos, e) {
    var c = 0;
    for (var i = 0; i < e.length; i++) {
      for (var j = i + 1; j < e.length; j++) {
        var a = e[i], b = e[j];
        if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
        if (segmentsCross(pos[a[0]], pos[a[1]], pos[b[0]], pos[b[1]])) c++;
      }
    }
    return c;
  }

  function generatePuzzle() {
    var n = MIN_NODES + Math.floor(Math.random() * (MAX_NODES - MIN_NODES + 1));
    edges = buildGraph(n);
    var slots = circlePositions(n);

    var ids = [];
    for (var i = 0; i < n; i++) ids.push(i);
    shuffle(ids);
    var fixedFraction = FIXED_FRACTION_MIN + Math.random() * (FIXED_FRACTION_MAX - FIXED_FRACTION_MIN);
    var fixedCount = clamp(Math.round(n * fixedFraction), 1, n - MIN_FREE);
    var fixedIds = ids.slice(0, fixedCount);
    var freeIds = ids.slice(fixedCount);

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

      var c = countCrossings(positions, edges);
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
    nodeEls = nodes.map(function (_, i) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("class", fixed[i] ? "node fixed" : "node");
      el.dataset.index = i;
      board.appendChild(el);
      return el;
    });
  }

  function nodeRadius(rect) {
    return Math.max(14, Math.min(22, Math.min(rect.width, rect.height) * 0.05));
  }

  function render() {
    var rect = board.getBoundingClientRect();
    var r = nodeRadius(rect);

    var crossing = new Array(edges.length);
    for (var i = 0; i < edges.length; i++) {
      crossing[i] = false;
      for (var j = 0; j < edges.length; j++) {
        if (i === j) continue;
        var a = edges[i], b = edges[j];
        if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
        if (segmentsCross(nodes[a[0]], nodes[a[1]], nodes[b[0]], nodes[b[1]])) { crossing[i] = true; break; }
      }
    }
    var count = crossing.reduce(function (s, v) { return s + (v ? 1 : 0); }, 0);

    for (var e = 0; e < edges.length; e++) {
      var pair = edges[e], p1 = nodes[pair[0]], p2 = nodes[pair[1]];
      var el = edgeEls[e];
      el.setAttribute("x1", p1.x * rect.width);
      el.setAttribute("y1", p1.y * rect.height);
      el.setAttribute("x2", p2.x * rect.width);
      el.setAttribute("y2", p2.y * rect.height);
      el.classList.toggle("crossing", crossing[e]);
    }

    for (var n = 0; n < nodes.length; n++) {
      var nel = nodeEls[n];
      nel.setAttribute("cx", nodes[n].x * rect.width);
      nel.setAttribute("cy", nodes[n].y * rect.height);
      nel.setAttribute("r", n === dragIndex ? r + 4 : r);
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
    var el = e.target.closest(".node");
    if (!el) return;
    var idx = parseInt(el.dataset.index, 10);
    if (fixed[idx]) { triggerShake(el); return; }
    activePointerId = e.pointerId;
    dragIndex = idx;
    dragMoved = false;
    clearHint();
    el.classList.add("active");
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  board.addEventListener("pointermove", function (e) {
    if (e.pointerId !== activePointerId || dragIndex < 0) return;
    var rect = board.getBoundingClientRect();
    nodes[dragIndex].x = clamp((e.clientX - rect.left) / rect.width, PAD, 1 - PAD);
    nodes[dragIndex].y = clamp((e.clientY - rect.top) / rect.height, PAD, 1 - PAD);
    dragMoved = true;
    var before = parseInt(crossingsVal.textContent, 10);
    var after = render();
    if (after < before) sndRelease();
  });

  function endDrag(e) {
    if (e.pointerId !== activePointerId) return;
    if (dragIndex >= 0) nodeEls[dragIndex].classList.remove("active");
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
