(function () {
  "use strict";

  var SIZE = 4;
  var TOTAL = SIZE * SIZE;
  var SHUFFLE_MOVES = 160;
  var BEST_KEY = "slideNOrderBest";

  var slotsGrid = document.getElementById("slotsGrid");
  var tilesGrid = document.getElementById("tilesGrid");
  var movesVal = document.getElementById("movesVal");
  var bestVal = document.getElementById("bestVal");
  var restartBtn = document.getElementById("restartBtn");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlaySub = document.getElementById("overlaySub");
  var againBtn = document.getElementById("againBtn");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var challengeBanner = document.getElementById("challengeBanner");

  var tiles = [];        // index -> tile number (1..15) or null for the blank
  var blankIndex = TOTAL - 1;
  var tileEls = {};      // index -> tile button el
  var moves = 0;
  var ended = false;
  var best = readBest();

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
  function sndSlide() { tone(900, 0.08, "sine", 0.05); }
  function sndThud() { tone(140, 0.15, "sine", 0.05); }

  function neighborIndices(i) {
    var r = Math.floor(i / SIZE), c = i % SIZE;
    var out = [];
    if (r > 0) out.push(i - SIZE);
    if (r < SIZE - 1) out.push(i + SIZE);
    if (c > 0) out.push(i - 1);
    if (c < SIZE - 1) out.push(i + 1);
    return out;
  }

  function buildSolved() {
    tiles = [];
    for (var i = 0; i < TOTAL - 1; i++) tiles.push(i + 1);
    tiles.push(null);
    blankIndex = TOTAL - 1;
  }

  function isSolved() {
    for (var i = 0; i < TOTAL - 1; i++) {
      if (tiles[i] !== i + 1) return false;
    }
    return tiles[TOTAL - 1] === null;
  }

  function shuffleBoard() {
    buildSolved();
    var prevBlank = -1;
    for (var n = 0; n < SHUFFLE_MOVES; n++) {
      var candidates = neighborIndices(blankIndex).filter(function (idx) { return idx !== prevBlank; });
      if (!candidates.length) candidates = neighborIndices(blankIndex);
      var chosen = candidates[Math.floor(Math.random() * candidates.length)];
      prevBlank = blankIndex;
      tiles[blankIndex] = tiles[chosen];
      tiles[chosen] = null;
      blankIndex = chosen;
    }
    if (isSolved()) {
      var extra = neighborIndices(blankIndex);
      var pick = extra[Math.floor(Math.random() * extra.length)];
      tiles[blankIndex] = tiles[pick];
      tiles[pick] = null;
      blankIndex = pick;
    }
  }

  function buildDom() {
    slotsGrid.innerHTML = "";
    tilesGrid.innerHTML = "";
    for (var i = 0; i < TOTAL; i++) {
      var slot = document.createElement("div");
      slot.className = "slot";
      slotsGrid.appendChild(slot);

      var cell = document.createElement("div");
      cell.className = "cell";
      tilesGrid.appendChild(cell);
    }
  }

  function tileCellEl(i) {
    return tilesGrid.children[i];
  }

  function renderTiles() {
    for (var i = 0; i < TOTAL; i++) tileCellEl(i).innerHTML = "";
    tileEls = {};
    for (var i2 = 0; i2 < TOTAL; i2++) {
      var v = tiles[i2];
      if (v != null) addTileEl(i2, v);
    }
    updateCorrectness();
    updateMovable();
  }

  function addTileEl(i, value) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.textContent = value;
    btn.dataset.index = i;
    btn.setAttribute("aria-label", "Tile " + value);
    btn.addEventListener("click", onTileClick);
    tileCellEl(i).appendChild(btn);
    tileEls[i] = btn;
    return btn;
  }

  function updateCorrectness() {
    for (var i = 0; i < TOTAL - 1; i++) {
      var el = tileEls[i];
      if (!el) continue;
      if (tiles[i] === i + 1) el.classList.add("correct");
      else el.classList.remove("correct");
    }
  }

  function updateMovable() {
    Object.keys(tileEls).forEach(function (k) {
      tileEls[k].classList.remove("movable");
      tileEls[k].classList.remove("bounce");
    });
    var isFirstTurn = moves === 0;
    neighborIndices(blankIndex).forEach(function (idx) {
      if (tileEls[idx]) {
        tileEls[idx].classList.add("movable");
        if (isFirstTurn) tileEls[idx].classList.add("bounce");
      }
    });
  }

  function flip(el, fromCell, toCell) {
    var f = fromCell.getBoundingClientRect();
    var t = toCell.getBoundingClientRect();
    var dx = f.left - t.left;
    var dy = f.top - t.top;
    el.style.transition = "none";
    el.style.transform = "translate(" + dx + "px," + dy + "px)";
    void el.offsetWidth;
    el.style.transition = "";
    el.style.transform = "";
  }

  function slideTile(i) {
    var fromCell = tileCellEl(i);
    var toCell = tileCellEl(blankIndex);
    var el = tileEls[i];
    var oldBlank = blankIndex;

    el.classList.remove("movable"); // the bounce animation would fight the FLIP transform below
    el.classList.remove("bounce");

    tiles[oldBlank] = tiles[i];
    tiles[i] = null;
    blankIndex = i;

    delete tileEls[i];
    toCell.appendChild(el);
    el.dataset.index = oldBlank;
    tileEls[oldBlank] = el;
    flip(el, fromCell, toCell);

    sndSlide();
    moves += 1;
    updateMovesHud();
    updateCorrectness();
    updateMovable();
    checkWin();
  }

  function updateMovesHud() {
    movesVal.textContent = moves;
  }

  function updateBestHud() {
    bestVal.textContent = best != null ? "Best " + best : "";
  }

  function onTileClick(e) {
    e.stopPropagation();
    if (ended) return;
    var i = parseInt(this.dataset.index, 10);
    if (neighborIndices(blankIndex).indexOf(i) === -1) {
      var el = this;
      el.classList.add("shake");
      sndThud();
      setTimeout(function () { el.classList.remove("shake"); }, 240);
      return;
    }
    slideTile(i);
  }

  function checkWin() {
    if (isSolved()) {
      ended = true;
      var isNewBest = best == null || moves < best;
      if (isNewBest) writeBest(moves);
      updateBestHud();
      setTimeout(function () {
        showOverlay(isNewBest ? "NEW BEST" : "SOLVED", moves + (moves === 1 ? " move" : " moves"));
      }, 350);
    }
  }

  function showOverlay(title, sub) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    shareNote.classList.remove("show");
    overlay.classList.add("show");
  }

  function hideOverlay() {
    overlay.classList.remove("show");
  }

  function shareUrl(moveCount) {
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("moves", String(moveCount));
    return url.toString();
  }

  function shareResult() {
    var url = shareUrl(moves);
    var text = "I solved Slide N Order in " + moves + (moves === 1 ? " move" : " moves") + ". Can you beat that?";

    if (navigator.share) {
      navigator.share({ title: "Slide N Order", text: text, url: url }).catch(function () {});
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

  function checkChallengeLink() {
    if (!challengeBanner) return;
    var params = new URLSearchParams(location.search);
    var raw = params.get("moves");
    var challengeMoves = parseInt(raw, 10);
    if (!raw || !isFinite(challengeMoves) || challengeMoves <= 0) return;
    challengeBanner.textContent = "A friend solved it in " + challengeMoves + (challengeMoves === 1 ? " move" : " moves") + " — tap to dismiss and beat it";
    challengeBanner.classList.add("show");
    challengeBanner.addEventListener("click", function () {
      challengeBanner.classList.remove("show");
    });
  }

  function restart() {
    ended = false;
    moves = 0;
    hideOverlay();
    shuffleBoard();
    renderTiles();
    updateMovesHud();
    updateBestHud();
  }

  function openHowto() {
    howtoSheet.classList.add("show");
    howtoBackdrop.classList.add("show");
  }
  function closeHowto() {
    howtoSheet.classList.remove("show");
    howtoBackdrop.classList.remove("show");
  }

  restartBtn.addEventListener("click", restart);
  againBtn.addEventListener("click", restart);
  howtoBtn.addEventListener("click", openHowto);
  howtoBackdrop.addEventListener("click", closeHowto);
  shareBtn.addEventListener("click", shareResult);

  buildDom();
  shuffleBoard();
  renderTiles();
  updateMovesHud();
  updateBestHud();
  checkChallengeLink();
})();
