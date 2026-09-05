import { renderGlobalBest } from "../shared/ui/leaderboard.js";
import { initHowto, initShare, createNote, bindOverlay } from "../shared/ui/shell.js";
import { tone, toggle as toggleSound, onChange as onSoundChange } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { get as getPref, set as setPref } from "../shared/ui/prefs.js";

(function () {
  "use strict";

  var SIZE = 7;
  // Classic 33-hole cross board. true = hole exists.
  var MASK = [
    [0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0],
  ];
  var CENTER = [3, 3];

  var holesGrid = document.getElementById("holesGrid");
  var marblesGrid = document.getElementById("marblesGrid");
  var countEl = document.getElementById("count");
  var undoBtn = document.getElementById("undoBtn");
  var restartBtn = document.getElementById("restartBtn");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlaySub = document.getElementById("overlaySub");
  var globalBest = document.getElementById("globalBest");
  var againBtn = document.getElementById("againBtn");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var soundBtn = document.getElementById("soundBtn");
  var themeBtn = document.getElementById("themeBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var hintBanner = document.getElementById("hintBanner");
  var hintBannerClose = document.getElementById("hintBannerClose");

  var board = [];        // 0 = empty hole, 1 = marble, null = not a cell
  var holeEls = {};      // "r,c" -> hole div
  var marbleEls = {};    // "r,c" -> marble div
  var selected = null;   // [r,c] or null
  var history = [];      // [{from, to, mid}]
  var ended = false;

  var HINT_STORAGE_KEY = "marble-nostalgia.played";
  var hintsActive = false;
  try {
    hintsActive = !getPref(HINT_STORAGE_KEY, null);
  } catch (e) { hintsActive = false; }

  // ---------- audio ----------
  function sndClick() { tone(1100, 0.12, "sine", 0.06); tone(700, 0.1, "sine", 0.03); }
  function sndThud() { tone(140, 0.15, "sine", 0.05); }

  function key(r, c) { return r + "," + c; }

  function buildBoard() {
    board = [];
    for (var r = 0; r < SIZE; r++) {
      board.push([]);
      for (var c = 0; c < SIZE; c++) {
        board[r].push(MASK[r][c] ? 1 : null);
      }
    }
    board[CENTER[0]][CENTER[1]] = 0;
  }

  function buildDom() {
    holesGrid.innerHTML = "";
    marblesGrid.innerHTML = "";
    holeEls = {};
    marbleEls = {};

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var holeCell = document.createElement("div");
        holeCell.className = "cell";
        if (MASK[r][c]) {
          var hole = document.createElement("div");
          hole.className = "hole";
          hole.dataset.r = r;
          hole.dataset.c = c;
          hole.addEventListener("click", onHoleClick);
          holeCell.appendChild(hole);
          holeEls[key(r, c)] = hole;
        }
        holesGrid.appendChild(holeCell);

        var marbleCell = document.createElement("div");
        marbleCell.className = "cell";
        marbleCell.dataset.r = r;
        marbleCell.dataset.c = c;
        marblesGrid.appendChild(marbleCell);
      }
    }
  }

  function marbleCellEl(r, c) {
    return marblesGrid.children[r * SIZE + c];
  }

  function renderMarbles() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = marbleCellEl(r, c);
        cell.innerHTML = "";
      }
    }
    marbleEls = {};
    for (var r2 = 0; r2 < SIZE; r2++) {
      for (var c2 = 0; c2 < SIZE; c2++) {
        if (board[r2][c2] === 1) {
          addMarbleEl(r2, c2);
        }
      }
    }
    if (hintsActive) {
      updateHints();
      showHintBanner();
    } else {
      hideHintBanner();
    }
  }

  function addMarbleEl(r, c) {
    var m = document.createElement("div");
    m.className = "marble";
    m.dataset.r = r;
    m.dataset.c = c;
    m.style.setProperty("--i", (r * 3 + c * 5) % 8);
    m.addEventListener("click", onMarbleClick);
    marbleCellEl(r, c).appendChild(m);
    marbleEls[key(r, c)] = m;
    return m;
  }

  function neighbors(r, c) {
    return [
      { mid: [r - 1, c], to: [r - 2, c] },
      { mid: [r + 1, c], to: [r + 2, c] },
      { mid: [r, c - 1], to: [r, c - 2] },
      { mid: [r, c + 1], to: [r, c + 2] },
    ];
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function validMoves(r, c) {
    if (board[r][c] !== 1) return [];
    var out = [];
    neighbors(r, c).forEach(function (n) {
      var mr = n.mid[0], mc = n.mid[1], tr = n.to[0], tc = n.to[1];
      if (!inBounds(tr, tc)) return;
      if (board[mr][mc] === 1 && board[tr][tc] === 0) {
        out.push({ mid: n.mid, to: n.to });
      }
    });
    return out;
  }

  function anyMovesLeft() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === 1 && validMoves(r, c).length) return true;
      }
    }
    return false;
  }

  function updateHints() {
    if (!hintsActive) return;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var el = marbleEls[key(r, c)];
        if (!el) continue;
        var isSelected = selected && selected[0] === r && selected[1] === c;
        if (!isSelected && validMoves(r, c).length) {
          el.classList.add("hint-bounce");
        } else {
          el.classList.remove("hint-bounce");
        }
      }
    }
  }

  function clearHints() {
    Object.keys(marbleEls).forEach(function (k) {
      marbleEls[k].classList.remove("hint-bounce");
    });
  }

  function showHintBanner() {
    if (hintBanner) hintBanner.classList.add("show");
  }

  function hideHintBanner() {
    if (hintBanner) hintBanner.classList.remove("show");
  }

  function stopHinting() {
    if (!hintsActive) return;
    hintsActive = false;
    clearHints();
    hideHintBanner();
    setPref(HINT_STORAGE_KEY, "1");
  }

  function marbleCount() {
    var n = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === 1) n++;
      }
    }
    return n;
  }

  function updateHud() {
    countEl.textContent = marbleCount();
  }

  function clearSelection() {
    if (selected) {
      var el = marbleEls[key(selected[0], selected[1])];
      if (el) el.classList.remove("selected");
    }
    Object.keys(holeEls).forEach(function (k) {
      holeEls[k].classList.remove("valid-target");
    });
    selected = null;
    updateHints();
  }

  function selectMarble(r, c) {
    clearSelection();
    var moves = validMoves(r, c);
    if (!moves.length) {
      var el = marbleEls[key(r, c)];
      if (el) {
        el.classList.add("shake");
        sndThud();
        setTimeout(function () { el.classList.remove("shake"); }, 260);
      }
      return;
    }
    selected = [r, c];
    marbleEls[key(r, c)].classList.add("selected");
    marbleEls[key(r, c)].classList.remove("hint-bounce");
    moves.forEach(function (mv) {
      holeEls[key(mv.to[0], mv.to[1])].classList.add("valid-target");
    });
  }

  function flipMove(el, fromCell, toCell) {
    var f = fromCell.getBoundingClientRect();
    var t = toCell.getBoundingClientRect();
    var dx = f.left - t.left;
    var dy = f.top - t.top;
    el.style.transition = "none";
    el.style.transform = "translate(" + dx + "px," + dy + "px)";
    // force reflow
    void el.offsetWidth;
    el.style.transition = "";
    el.style.transform = "";
  }

  function doMove(from, mid, to, record) {
    stopHinting();
    var fromCellEl = marbleCellEl(from[0], from[1]);
    var toCellEl = marbleCellEl(to[0], to[1]);
    var midEl = marbleEls[key(mid[0], mid[1])];
    var movingEl = marbleEls[key(from[0], from[1])];

    board[from[0]][from[1]] = 0;
    board[mid[0]][mid[1]] = 0;
    board[to[0]][to[1]] = 1;

    delete marbleEls[key(from[0], from[1])];
    delete marbleEls[key(mid[0], mid[1])];

    toCellEl.appendChild(movingEl);
    movingEl.dataset.r = to[0];
    movingEl.dataset.c = to[1];
    marbleEls[key(to[0], to[1])] = movingEl;
    flipMove(movingEl, fromCellEl, toCellEl);

    if (midEl) {
      midEl.classList.add("captured");
      setTimeout(function () { midEl.remove(); }, 320);
      delete marbleEls[key(mid[0], mid[1])];
    }

    sndClick();

    if (record) {
      history.push({ from: from, mid: mid, to: to });
    }

    updateHud();
    checkEnd();
  }

  function undoMove() {
    if (ended || !history.length) return;
    clearSelection();
    var mv = history.pop();
    var fromCellEl = marbleCellEl(mv.from[0], mv.from[1]);
    var toCellEl = marbleCellEl(mv.to[0], mv.to[1]);
    var movingEl = marbleEls[key(mv.to[0], mv.to[1])];

    board[mv.from[0]][mv.from[1]] = 1;
    board[mv.mid[0]][mv.mid[1]] = 1;
    board[mv.to[0]][mv.to[1]] = 0;

    delete marbleEls[key(mv.to[0], mv.to[1])];
    fromCellEl.appendChild(movingEl);
    movingEl.dataset.r = mv.from[0];
    movingEl.dataset.c = mv.from[1];
    marbleEls[key(mv.from[0], mv.from[1])] = movingEl;
    flipMove(movingEl, toCellEl, fromCellEl);

    var midEl = addMarbleEl(mv.mid[0], mv.mid[1]);
    midEl.style.opacity = "0";
    midEl.style.transform = "scale(0.2)";
    requestAnimationFrame(function () {
      midEl.style.transition = "transform 0.25s ease, opacity 0.25s ease";
      midEl.style.opacity = "1";
      midEl.style.transform = "scale(1)";
    });

    sndClick();
    updateHud();
  }

  function checkEnd() {
    var n = marbleCount();
    if (n === 1) {
      ended = true;
      var lastKey = Object.keys(marbleEls)[0];
      if (lastKey) marbleEls[lastKey].classList.add("win-glow");
      setTimeout(function () {
        showOverlay("SOLVED", "1 marble left");
        showGlobalBest(1);
      }, 500);
    } else if (!anyMovesLeft()) {
      ended = true;
      setTimeout(function () {
        showOverlay("NO MORE MOVES", n + " marbles left");
        showGlobalBest(n);
      }, 200);
    }
  }

  // Fewest marbles left wins, so a perfect game scores 1 and the record
  // saturates there quickly. That is the game, not a flaw in the leaderboard.
  function showGlobalBest(marblesLeft) {
    renderGlobalBest(globalBest, {
      slug: "marble-nostalgia",
      score: marblesLeft,
      isRecord: function (score, best) { return score <= best; },
      label: function (best) {
        return "Global best " + best + (best === 1 ? " marble" : " marbles");
      },
      recordLabel: "\u2605 New global best \u2605",
      pending: "Global best \u2026",
      unavailable: "Global best unavailable",
    });
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

  function shareResult() {
    var n = marbleCount();
    var text = n === 1
      ? "I solved Marble Nostalgia — finished with 1 marble left!"
      : "I played Marble Nostalgia and got down to " + n + " marbles. Can you beat that?";
    var url = location.href;

    if (navigator.share) {
      navigator.share({ title: "Marble Nostalgia", text: text, url: url }).catch(function () {});
      return;
    }

    var payload = text + " " + url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(showShareNote).catch(function () {});
    }
  }

  function showShareNote() {
    note.show("Link copied");
  }

  function onMarbleClick(e) {
    e.stopPropagation();
    if (ended) return;
    var r = parseInt(this.dataset.r, 10);
    var c = parseInt(this.dataset.c, 10);
    if (selected && selected[0] === r && selected[1] === c) {
      clearSelection();
      return;
    }
    selectMarble(r, c);
  }

  function onHoleClick() {
    if (ended || !selected) return;
    var r = parseInt(this.dataset.r, 10);
    var c = parseInt(this.dataset.c, 10);
    var moves = validMoves(selected[0], selected[1]);
    var mv = moves.filter(function (m) { return m.to[0] === r && m.to[1] === c; })[0];
    if (!mv) return;
    var from = selected;
    clearSelection();
    doMove(from, mv.mid, mv.to, true);
  }

  function restart() {
    ended = false;
    history = [];
    selected = null;
    hideOverlay();
    buildBoard();
    renderMarbles();
    updateHud();
  }

  undoBtn.addEventListener("click", undoMove);
  restartBtn.addEventListener("click", restart);
  againBtn.addEventListener("click", restart);
  initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });
  var note = createNote(shareNote);

  bindOverlay(overlay, {
    primary: againBtn,
    inertRoot: document.querySelector(".stage"),
    label: "Game over",
  });

  initThemeToggle(themeBtn);

  onSoundChange(function (on) {
    soundBtn.classList.toggle("is-off", !on);
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
  });
  soundBtn.addEventListener("click", function () {
    if (toggleSound()) sndClick();
  });

  shareBtn.addEventListener("click", shareResult);
  if (hintBannerClose) hintBannerClose.addEventListener("click", stopHinting);

  buildBoard();
  buildDom();
  renderMarbles();
  updateHud();
})();
