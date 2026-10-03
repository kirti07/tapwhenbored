import { renderGlobalBest } from "../shared/ui/leaderboard.js";
import { initHowto, initShare, bindOverlay } from "../shared/ui/shell.js";
import { tone, initSoundToggle } from "../shared/ui/audio.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { getInt, set as setPref } from "../shared/ui/prefs.js";
import { recordPlay } from "../shared/ui/progress.js";
import { getName, clean } from "../shared/ui/player.js";

(function () {
  "use strict";

  var SIZE = 4;
  var TOTAL = SIZE * SIZE;
  var SHUFFLE_MOVES = 160;
  // A party round is a race against the room inside 90 seconds, so its
  // scramble is short enough that most players finish; solo keeps 160.
  var ROUND_SHUFFLE_MOVES = 26;
  var BEST_KEY = "slide-n-order.best";
  var MAX_BEAT_MOVES = 9999; // a longer "moves to beat" is a broken link

  // ---------- drag-to-slide tuning ----------
  var DRAG_COMMIT_FRACTION = 0.5;   // past halfway toward the gap commits the slide
  var DRAG_FLING_VELOCITY = 0.5;    // px/ms — a quick flick commits even short of halfway
  var TAP_MAX_MOVE = 6;             // px — under this, a press+release is a plain tap
  var TAP_MAX_MS = 400;
  var TAP_SETTLE_MS = 200;          // fixed settle for a tap (no drag velocity to base it on)
  var DRAG_MIN_SETTLE_MS = 110;
  var DRAG_MAX_SETTLE_MS = 240;

  var slotsGrid = document.getElementById("slotsGrid");
  var tilesGrid = document.getElementById("tilesGrid");
  var movesVal = document.getElementById("movesVal");
  var bestVal = document.getElementById("bestVal");
  var restartBtn = document.getElementById("restartBtn");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlaySub = document.getElementById("overlaySub");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var challengeCard = document.getElementById("challenge");
  var challengeWho = document.getElementById("challengeWho");
  var challengeBeat = document.getElementById("challengeBeat");
  var globalBest = document.getElementById("globalBest");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");
  var soundBtn = document.getElementById("soundBtn");
  var themeBtn = document.getElementById("themeBtn");

  var tiles = [];        // index -> tile number (1..15) or null for the blank
  var blankIndex = TOTAL - 1;
  var tileEls = {};      // index -> tile button el
  var moves = 0;
  var ended = false;
  var best = getInt(BEST_KEY);
  var seed = 0;          // what built this scramble; a challenge link carries it
  var challenge = readChallenge(); // null, or the run a shared link asks you to beat
  var round = null;      // set when this page is a Tap Party round
  var goAt = null;       // performance.now() when the round went live


  function writeBest(v) {
    best = v;
    setPref(BEST_KEY, v);
  }

  // ---------- audio ----------
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

  // ---------- seeded scrambles ----------
  //
  // Every scramble is built from a 32-bit seed, so the seed alone reproduces
  // it on any device: that is what makes a challenge link (and a party round)
  // the same board for everyone. mulberry32 is integer maths throughout, so it
  // gives the same sequence in every engine. A local copy on purpose — a shared
  // module used by two games would become a chunk of its own and one more
  // request on both pages.
  //
  // Changing anything that consumes `rand` changes which scramble an old seed
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

  /** The scramble a seed builds — a pure function of the seed (and length). */
  function shuffleBoard(seedValue, length) {
    var rand = mulberry32(seedValue);
    seed = seedValue;
    buildSolved();
    var prevBlank = -1;
    for (var n = 0; n < (length || SHUFFLE_MOVES); n++) {
      var candidates = neighborIndices(blankIndex).filter(function (idx) { return idx !== prevBlank; });
      if (!candidates.length) candidates = neighborIndices(blankIndex);
      var chosen = candidates[Math.floor(rand() * candidates.length)];
      prevBlank = blankIndex;
      tiles[blankIndex] = tiles[chosen];
      tiles[chosen] = null;
      blankIndex = chosen;
    }
    if (isSolved()) {
      var extra = neighborIndices(blankIndex);
      var pick = extra[Math.floor(rand() * extra.length)];
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

  /* Where a tile is, asked of the game state rather than of the DOM.
   *
   * `tileEls` is already the authoritative index -> element map and is updated
   * in the same breath as `tiles` on every slide. The old data-index attribute
   * was a second copy of that fact living on the node, rewritten mid-slide,
   * and then parsed back out on pointerdown and on keydown — so a missed
   * attribute write would have produced a tile that moved the wrong way rather
   * than a visible glitch. Sixteen entries; the scan costs nothing. */
  function indexOfTileEl(el) {
    for (var k in tileEls) {
      if (tileEls[k] === el) return parseInt(k, 10);
    }
    return -1;
  }

  function addTileEl(i, value) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.textContent = value;
    btn.setAttribute("aria-label", "Tile " + value);
    tileCellEl(i).appendChild(btn);
    tileEls[i] = btn;
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

  function shakeTile(el) {
    el.classList.add("shake");
    sndThud();
    setTimeout(function () { el.classList.remove("shake"); }, 240);
  }

  // ---------- drag-to-slide ----------
  // Tiles only ever move one cell, straight toward the gap, so the whole
  // gesture is a single axis-constrained drag: track the pointer 1:1 along
  // that axis, rubber-band past either end, and decide commit-vs-spring-back
  // on release from how far and how fast it moved — same shape as a
  // bottom-sheet drag, just squeezed into one grid cell.
  var drag = null;
  var pendingShakeEl = null;
  var activePointerId = null; // only one finger/pointer drives the board at a time
  var settling = false; // true from release until the deferred commit/spring-back finishes

  function rubberband(overshoot, dimension) {
    var constant = 0.55;
    return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
  }

  function beginDrag(e, tileEl, i) {
    var r = Math.floor(i / SIZE), c = i % SIZE;
    var br = Math.floor(blankIndex / SIZE);
    var axis = (r === br) ? "x" : "y";
    var fromRect = tileCellEl(i).getBoundingClientRect();
    var toRect = tileCellEl(blankIndex).getBoundingClientRect();
    var travel = axis === "x" ? (toRect.left - fromRect.left) : (toRect.top - fromRect.top);

    drag = {
      el: tileEl,
      index: i,
      axis: axis,
      dir: travel >= 0 ? 1 : -1,
      distance: Math.abs(travel),
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: e.timeStamp,
      maxAbsRaw: 0,
      progress: 0,
      lastProgress: 0,
      lastT: e.timeStamp,
      velocity: 0,
    };

    tileEl.classList.remove("movable");
    tileEl.classList.remove("bounce");
    tileEl.style.transition = "none";
    try { tileEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function updateDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var raw = drag.axis === "x" ? (e.clientX - drag.startX) : (e.clientY - drag.startY);
    drag.maxAbsRaw = Math.max(drag.maxAbsRaw, Math.abs(raw));

    var progress = raw * drag.dir; // positive = moving toward the gap
    var clamped;
    if (progress < 0) clamped = rubberband(progress, drag.distance);
    else if (progress > drag.distance) clamped = drag.distance + rubberband(progress - drag.distance, drag.distance);
    else clamped = progress;

    var dt = e.timeStamp - drag.lastT;
    if (dt > 0) {
      drag.velocity = (clamped - drag.lastProgress) / dt;
      drag.lastT = e.timeStamp;
      drag.lastProgress = clamped;
    }
    drag.progress = clamped;

    var screenDelta = clamped * drag.dir;
    drag.el.style.transform = drag.axis === "x"
      ? "translateX(" + screenDelta + "px)"
      : "translateY(" + screenDelta + "px)";
  }

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var d = drag;
    drag = null;

    var dt = e.timeStamp - d.startT;
    var isTap = !cancelled && d.maxAbsRaw < TAP_MAX_MOVE && dt < TAP_MAX_MS;
    var fraction = d.distance > 0 ? d.progress / d.distance : 0;
    var commit = !cancelled && (isTap
      || fraction > DRAG_COMMIT_FRACTION
      || (fraction > 0.12 && d.velocity > DRAG_FLING_VELOCITY));

    settleDrag(d, commit, isTap);
  }

  function settleDrag(d, commit, isTap) {
    settling = true;
    var el = d.el;
    var targetProgress = commit ? d.distance : 0;
    var remaining = Math.abs(targetProgress - d.progress);
    var duration;
    if (isTap) {
      duration = TAP_SETTLE_MS;
    } else {
      var speed = Math.max(0.35, Math.abs(d.velocity));
      duration = Math.min(DRAG_MAX_SETTLE_MS, Math.max(DRAG_MIN_SETTLE_MS, remaining / speed));
    }

    el.style.transition = "transform " + duration.toFixed(0) + "ms cubic-bezier(0.22, 1, 0.36, 1)";
    var finalDelta = targetProgress * d.dir;
    el.style.transform = d.axis === "x" ? "translateX(" + finalDelta + "px)" : "translateY(" + finalDelta + "px)";

    var settled = false;
    var fallbackTimer;
    var done = function () {
      if (settled) return; // transitionend and the fallback timer can both fire otherwise
      settled = true;
      clearTimeout(fallbackTimer);
      el.removeEventListener("transitionend", done);
      el.style.transition = "";
      el.style.transform = "";
      if (commit) commitSlide(d.index);
      else updateMovable();
      settling = false;
    };
    el.addEventListener("transitionend", done);
    fallbackTimer = setTimeout(done, duration + 60); // safety net if transitionend doesn't fire
  }

  function commitSlide(i) {
    var el = tileEls[i];
    if (!el) return; // stale settle callback from a state that no longer exists
    var toCell = tileCellEl(blankIndex);
    var oldBlank = blankIndex;

    tiles[oldBlank] = tiles[i];
    tiles[i] = null;
    blankIndex = i;

    delete tileEls[i];
    toCell.appendChild(el);
    tileEls[oldBlank] = el;

    sndSlide();
    moves += 1;
    updateMovesHud();
    updateCorrectness();
    updateMovable();
    checkWin();
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
    bestVal.textContent = challenge
      ? "To beat " + challenge.beat
      : best != null ? "Best " + best : "";
  }

  function checkWin() {
    if (isSolved()) {
      ended = true;
      // A party round has no end card: the party page takes it from here.
      if (round) {
        round.finish({ seed: seed, ms: Math.round(performance.now() - goAt), moves: moves });
        return;
      }
      // Before the 350ms overlay delay below, not inside it.
      recordPlay("slide-n-order", moves, true);
      var isNewBest = best == null || moves < best;
      if (isNewBest) writeBest(moves);
      updateBestHud();
      setTimeout(function () {
        showOverlay(isNewBest ? "NEW BEST" : "SOLVED", moves + (moves === 1 ? " move" : " moves"));
        // A challenge run is unranked (leaderboard.js refuses seeded runs), so
        // the global-best line answers the only question that run asked.
        if (challenge) {
          globalBest.hidden = false;
          globalBest.textContent = verdict(moves, challenge);
        } else {
          showGlobalBest(moves);
        }
      }, 350);
    }
  }

  function showOverlay(title, sub) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    shareNote.classList.remove("show");
    overlay.classList.add("show");
  }

  // Fewest moves wins. The end card is already complete before this runs, so a
  // slow or failed leaderboard costs nothing but this one line.
  function showGlobalBest(moveCount) {
    renderGlobalBest(globalBest, {
      slug: "slide-n-order",
      score: moveCount,
      isRecord: function (score, best) { return score <= best; },
      label: function (best) {
        return "Global best " + best + (best === 1 ? " move" : " moves");
      },
      recordLabel: "\u2605 New global best \u2605",
      pending: "Global best \u2026",
      unavailable: "Global best unavailable",
    });
  }

  function hideOverlay() {
    overlay.classList.remove("show");
  }

  // ---------- challenges ----------
  //
  // A challenge link is this page's own URL with the scramble's seed, the
  // moves to beat and, when the sharer has set one, their name:
  //   /slide-n-order/?seed=1k3x9z&beat=38&by=Riya
  // Opening it replays that exact scramble. The URL is the whole state: while
  // it carries a seed the run is a challenge, and leaderboard.js reads the same
  // URL to keep the run off the global boards. A new board strips the query,
  // which makes the next run ranked again.

  /** The challenge in this page's URL, or null if it has none or a bad one. */
  function readChallenge() {
    var params = new URLSearchParams(location.search);
    var rawSeed = params.get("seed") || "";
    var beat = Number(params.get("beat"));
    if (!/^[0-9a-z]{1,7}$/.test(rawSeed)) return null;
    var seedValue = parseInt(rawSeed, 36);
    if (seedValue > 0xffffffff) return null;
    if (!Number.isInteger(beat) || beat <= 0 || beat > MAX_BEAT_MOVES) return null;
    return { seed: seedValue, beat: beat, by: clean(params.get("by")) };
  }

  function showChallenge() {
    challengeWho.textContent = (challenge.by || "A friend") + " solved this in";
    challengeBeat.textContent = "Beat " + challenge.beat + (challenge.beat === 1 ? " move" : " moves");
    challengeCard.hidden = false;
  }

  function leaveChallenge() {
    if (!challenge) return;
    challenge = null;
    challengeCard.hidden = true;
    history.replaceState(history.state, "", location.pathname);
  }

  /** One line for the end card: did this run beat the link? */
  function verdict(moveCount, c) {
    var who = c.by || "your friend";
    var gap = Math.abs(c.beat - moveCount);
    if (gap === 0) return "Level with " + who;
    var n = gap + (gap === 1 ? " move" : " moves");
    return moveCount < c.beat ? "You beat " + who + " by " + n : n + " behind " + who;
  }

  function shareUrl() {
    var url = new URL(location.pathname, location.origin);
    url.searchParams.set("seed", seed.toString(36));
    url.searchParams.set("beat", String(moves));
    var name = getName();
    if (name) url.searchParams.set("by", name);
    return url.toString();
  }

  function track(name) {
    try { window.gtag("event", name, { game: "slide-n-order" }); } catch (e) { /* analytics never matters */ }
  }

  /** A fresh scramble from a fresh seed; leaves any challenge behind. */
  function restart() {
    leaveChallenge();
    ended = false;
    moves = 0;
    hideOverlay();
    shuffleBoard(randomSeed());
    renderTiles();
    updateMovesHud();
    updateBestHud();
  }

  // ---------- how to play ----------
  initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });

  restartBtn.addEventListener("click", restart);
  againBtn.addEventListener("click", restart);
  bindOverlay(overlay, {
    primary: againBtn,
    label: "Game over",
  });

  initThemeToggle(themeBtn);

  initSoundToggle(soundBtn, sndSlide);

  initShare({
    btn: shareBtn,
    note: shareNote,
    title: "Slide N Order",
    text: function () {
      return "I solved this Slide N Order board in " + moves +
        (moves === 1 ? " move" : " moves") + ". Same board — beat me.";
    },
    url: shareUrl,
  });
  shareBtn.addEventListener("click", function () { track("challenge_shared"); });

  tilesGrid.addEventListener("pointerdown", function (e) {
    if (ended || activePointerId !== null || settling) return; // one interaction at a time, and only once the last one has fully committed
    var tileEl = e.target.closest(".tile");
    if (!tileEl) return;
    activePointerId = e.pointerId;
    var i = indexOfTileEl(tileEl);
    if (neighborIndices(blankIndex).indexOf(i) !== -1) {
      beginDrag(e, tileEl, i);
    } else {
      pendingShakeEl = { el: tileEl, x: e.clientX, y: e.clientY };
      try { tileEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  });
  tilesGrid.addEventListener("pointermove", function (e) {
    if (drag && e.pointerId === activePointerId) updateDrag(e);
  });
  tilesGrid.addEventListener("pointerup", function (e) {
    if (e.pointerId !== activePointerId) return;
    if (drag) {
      endDrag(e);
    } else if (pendingShakeEl) {
      var moved = Math.hypot(e.clientX - pendingShakeEl.x, e.clientY - pendingShakeEl.y);
      if (moved < TAP_MAX_MOVE) shakeTile(pendingShakeEl.el);
      pendingShakeEl = null;
    }
    activePointerId = null;
  });
  tilesGrid.addEventListener("pointercancel", function (e) {
    if (e.pointerId !== activePointerId) return;
    if (drag) endDrag(e, true);
    pendingShakeEl = null;
    activePointerId = null;
  });
  tilesGrid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var tileEl = e.target.closest(".tile");
    if (!tileEl) return;
    e.preventDefault(); // stop the browser's own click-on-activate; we handle it here
    if (ended || settling) return;
    var i = indexOfTileEl(tileEl);
    if (neighborIndices(blankIndex).indexOf(i) === -1) {
      shakeTile(tileEl);
      return;
    }
    slideTile(i);
  });

  // ---------- party rounds ----------
  //
  // Inside /party/ the page plays one short seeded scramble on the party's
  // clock: dealt at once and locked, timed from the moment the party page
  // says the round went live. The contract is below.

  /* The Tap Party round contract (ARCHITECTURE.md, "Tap Party"). Written out
     in each game rather than shared: a shared module would cost both game
     pages a chunk and a request for ~20 lines. Both directions check origin
     and source, and post to this origin only.
       child  → parent  { type: "ready" }
       parent → child   { type: "go", elapsed }   live since `elapsed` ms
       child  → parent  { type: "result", seed, ms, moves } */
  function readRound() {
    var params = new URLSearchParams(location.search);
    var raw = params.get("seed") || "";
    if (params.get("party") !== "1" || window.self === window.top) return null;
    if (!/^[0-9a-z]{1,7}$/.test(raw) || parseInt(raw, 36) > 0xffffffff) return null;
    return { seed: parseInt(raw, 36) };
  }

  function joinRound(onGo) {
    window.addEventListener("message", function (e) {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      if (e.data && e.data.type === "go" && Number.isFinite(e.data.elapsed)) onGo(Math.max(0, e.data.elapsed));
    });
    window.parent.postMessage({ type: "ready" }, location.origin);
    return {
      finish: function (result) {
        window.parent.postMessage(Object.assign({ type: "result" }, result), location.origin);
      },
    };
  }

  function playRound(r) {
    document.documentElement.dataset.party = "wait";
    ended = true; // locked until the round goes live
    shuffleBoard(r.seed, ROUND_SHUFFLE_MOVES);
    renderTiles();
    updateMovesHud();
    round = joinRound(function (elapsed) {
      if (goAt !== null) return;
      goAt = performance.now() - elapsed;
      document.documentElement.dataset.party = "on";
      ended = false;
    });
  }

  function startSolo() {
    if (challenge) {
      showChallenge();
      shuffleBoard(challenge.seed);
      track("challenge_link_opened");
    } else {
      shuffleBoard(randomSeed());
    }
    renderTiles();
    updateMovesHud();
    updateBestHud();
  }

  buildDom();
  var asRound = readRound();
  if (asRound) playRound(asRound);
  else startSolo(); // including a round URL opened on its own
})();
