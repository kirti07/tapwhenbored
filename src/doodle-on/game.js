import { pickRound, drawShape } from "./prompts.js";

// initShare is deliberately not imported: this game shares a rendered PNG, not
// a link. See the header of ../shared/ui/shell.js.
import { initHowto, bindOverlay } from "../shared/ui/shell.js";

(function () {
  "use strict";

  // ---------- tuning ----------
  var LINE_WIDTH = 3;       // px, CSS space
  var SHAPE_WIDTH = 2.5;    // the given shape is thinner than the player's line
  var SHAPE_SPAN = 0.52;    // of the short side, leaving room to draw around it
  var PALETTE = ["#ff9a3d", "#ff5f96", "#a970ff", "#4fb8ff", "#2ee6b8", "#ffd93d"];
  var STOP_DIST = 130;      // px of drawn distance per palette stop, then it loops
  var ROUND_MS = 30000;
  var URGENT_MS = 5000;
  var FINISH_MS = 900;      // must match the doodle-present keyframe
  var ALPHA_TOL = 20;       // stroke-layer alpha at or above this is a fill wall

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  var PALETTE_RGB = PALETTE.map(hexToRgb);

  /* Kept from the original game: the rainbow cycling by drawn distance is this
     game's signature, so it survives the redesign as what the first swatch
     produces rather than as the only thing the pencil can do. */
  function colorForDistance(dist) {
    var n = PALETTE_RGB.length;
    var t = (dist / STOP_DIST) % n;
    if (t < 0) t += n;
    var i0 = Math.floor(t), i1 = (i0 + 1) % n, f = t - i0;
    var c0 = PALETTE_RGB[i0], c1 = PALETTE_RGB[i1];
    var r = Math.round(c0.r + (c1.r - c0.r) * f);
    var g = Math.round(c0.g + (c1.g - c0.g) * f);
    var b = Math.round(c0.b + (c1.b - c0.b) * f);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function isDark() {
    return document.documentElement.dataset.theme === "dark";
  }

  // ---------- dom ----------
  var canvasWrap = document.getElementById("canvasWrap");
  var layers = document.getElementById("layers");
  var strokeCanvas = document.getElementById("canvas");
  var paintCanvas = document.getElementById("paintCanvas");
  var sctx = strokeCanvas.getContext("2d");
  /* willReadFrequently only on the paint layer: it is read back on every
     bucket tap but never drawn to per-frame. Setting it on the stroke layer
     would push drawing onto a software backend and make the pencil worse. */
  var pctx = paintCanvas.getContext("2d", { willReadFrequently: true });

  var promptText = document.getElementById("promptText");
  var promptShape = document.getElementById("promptShape");
  var promptDir = document.getElementById("promptDir");
  var timerPill = document.getElementById("timerPill");
  var timerVal = document.getElementById("timerVal");
  var timerBar = document.getElementById("timerBar");
  var idlePrompt = document.getElementById("idlePrompt");

  var toolbar = document.querySelector(".toolbar");
  var swatchesEl = document.getElementById("swatches");
  var pencilTool = document.getElementById("pencilTool");
  var paintTool = document.getElementById("paintTool");
  var undoTool = document.getElementById("undoTool");
  var clearTool = document.getElementById("clearTool");
  var doneBtn = document.getElementById("doneBtn");
  var restartBtn = document.getElementById("restartBtn");

  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlaySub = document.getElementById("overlaySub");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");

  var endCard = bindOverlay(overlay);

  // ---------- state ----------
  var phase = "idle";        // "idle" | "playing" | "finished"
  var round = null;          // { shape, label, direction }
  var tool = "pencil";       // "pencil" | "paint"
  var swatch = 0;

  var dpr = 1, cssW = 0, cssH = 0;
  var drawing = false, activePointerId = null, lastRaw = null;
  /* Cumulative across the whole round, not per stroke. Resetting it on every
     pointerdown (as the one-stroke version did) would restart the rainbow's
     hue on each lift; keeping it running is what makes the palette read as a
     single marker being carried across the drawing. */
  var totalDist = 0;

  var deadline = 0, timerHandle = null, lastShown = -1, lastBeep = -1;
  /* Stamped the moment the round ends, so the readout freezes at what was left
     instead of snapping to 0:00 — hitting Done with 22 seconds spare must not
     report that the clock ran out. */
  var finalLeft = 0;
  var pauseCount = 0, pausedAt = 0;
  var finishTimer = null, resizeTimer = null;

  // ---------- tiny procedural audio, no assets ----------
  var actx = null;
  function actxGet() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    /* A round can end on the clock with no input at all, which means the
       context is first created outside a user gesture and starts suspended.
       Without this the end tone is silently dropped. */
    if (actx.state === "suspended") {
      try { actx.resume(); } catch (e) { /* ignore */ }
    }
    return actx;
  }
  function tone(freq, dur, gain) {
    try {
      var c = actxGet();
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(g).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch (e) { /* audio not available, ignore */ }
  }
  function sndEnd() { tone(180, 0.22, 0.05); }

  // ---------- colours ----------
  var INK = isDark() ? "#f0eefa" : "#262b3d";
  var SWATCHES = ["rainbow", INK, "#ff5f96", "#ff9a3d", "#2ee6b8", "#4fb8ff"];
  var SWATCH_NAMES = ["Rainbow", "Ink", "Pink", "Orange", "Teal", "Blue"];

  function isRainbow() { return SWATCHES[swatch] === "rainbow"; }

  function strokeColorFor(dist) {
    return isRainbow() ? colorForDistance(dist) : SWATCHES[swatch];
  }

  /* A bucket needs one flat colour. With the rainbow selected it takes the
     cycle's current hue and then advances it, so successive fills land on
     visibly different colours instead of all coming out the same. */
  function fillColor() {
    if (!isRainbow()) return SWATCHES[swatch];
    var c = colorForDistance(totalDist);
    totalDist += STOP_DIST * 0.55;
    return c;
  }

  function parseColor(css) {
    if (css.charAt(0) === "#") return hexToRgb(css);
    var m = css.match(/\d+/g);
    return { r: +m[0], g: +m[1], b: +m[2] };
  }

  function shapeInk() {
    // Pale enough to read as a printed template rather than as the player's line.
    return isDark() ? "rgba(240,238,250,0.42)" : "rgba(38,43,61,0.45)";
  }

  // ---------- canvas sizing ----------
  function sizeLayer(c, ctx) {
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = LINE_WIDTH;
  }

  function snapshot(c) {
    var off = document.createElement("canvas");
    off.width = c.width;
    off.height = c.height;
    off.getContext("2d").drawImage(c, 0, 0);
    return off;
  }

  /* `preserve` keeps the drawing across a resize. It has to: setting
     canvas.width blanks the layer, and with multi-stroke play `drawing` is
     false for most of the round, so an iOS URL-bar collapse between strokes
     would otherwise erase a half-finished doodle. */
  function resizeCanvas(preserve) {
    /* clientWidth/Height, not a bounding rect. Two reasons: the wrapper's
       *rect* includes its 1.5px border while the layers sit inset inside it,
       so measuring the border box stretches the drawing by ~3px and puts every
       pointer coordinate slightly off; and a bounding rect reflects any
       transform in play, so the end-of-round animation on .layers would feed
       a rotated, scaled box straight back into the bitmap size. The padding
       box is immune to both. */
    var w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
    // Layout not settled yet; the ResizeObserver below calls back once it is.
    if (!w || !h) return;
    var nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (preserve && cssW &&
        Math.abs(w - cssW) < 2 && Math.abs(h - cssH) < 2 && nextDpr === dpr) {
      return; // visualViewport churn, not a real resize
    }

    /* Only resample once the player has made something. Nothing exists yet at
       idle, and the webfont landing just after load resizes this box — a
       pristine template should not come out of that slightly blurred, so
       re-derive it at the new size instead. */
    var rescale = Boolean(preserve && cssW && phase !== "idle");
    var keepStroke = rescale ? snapshot(strokeCanvas) : null;
    var keepPaint = rescale ? snapshot(paintCanvas) : null;
    var keepUndo = rescale && undoLayer ? snapshot(undoCanvas) : null;

    cssW = w; cssH = h; dpr = nextDpr;
    sizeLayer(paintCanvas, pctx);
    sizeLayer(strokeCanvas, sctx);
    allocFillBuffers();

    if (rescale) {
      pctx.drawImage(keepPaint, 0, 0, cssW, cssH);
      sctx.drawImage(keepStroke, 0, 0, cssW, cssH);
      /* The undo snapshot has to follow the layers. Left at the old size it
         would restore a differently-sized bitmap at 1:1 device pixels, and
         simply dropping it would mean a resize silently costs the player the
         undo they were promised. */
      if (keepUndo) {
        undoCanvas.width = strokeCanvas.width;
        undoCanvas.height = strokeCanvas.height;
        undoCanvas.getContext("2d")
          .drawImage(keepUndo, 0, 0, undoCanvas.width, undoCanvas.height);
      }
    } else {
      stampShape();
      clearUndo();
    }
    alphaDirty = true;
  }

  function localPoint(e) {
    var rect = strokeCanvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (x < 0) x = 0; else if (x > cssW) x = cssW;
    if (y < 0) y = 0; else if (y > cssH) y = cssH;
    return { x: x, y: y };
  }

  function stampShape() {
    if (!round) return;
    var k = Math.min(cssW, cssH) * SHAPE_SPAN;
    drawShape(sctx, round.shape, k, (cssW - k) / 2, (cssH - k) / 2, shapeInk(), SHAPE_WIDTH);
    alphaDirty = true;
  }

  // ---------- one-step undo ----------
  /* One snapshot, of one layer. A pencil stroke only ever touches the stroke
     layer and a fill only ever touches the paint layer, so remembering which
     halves both the memory and the copy cost. Deeper history would mean
     keeping several device-resolution canvases alive, which is exactly the
     kind of weight this game is supposed to avoid. */
  var undoCanvas = null;
  var undoLayer = null;   // "stroke" | "paint" | null
  var undoDist = 0;

  function captureUndo(layer) {
    var src = layer === "paint" ? paintCanvas : strokeCanvas;
    if (!undoCanvas) undoCanvas = document.createElement("canvas");
    if (undoCanvas.width !== src.width || undoCanvas.height !== src.height) {
      undoCanvas.width = src.width;
      undoCanvas.height = src.height;
    }
    var uctx = undoCanvas.getContext("2d");
    uctx.clearRect(0, 0, undoCanvas.width, undoCanvas.height);
    uctx.drawImage(src, 0, 0);
    undoLayer = layer;
    undoDist = totalDist;
    syncUndo();
  }

  function undo() {
    if (!undoLayer || phase === "finished") return;
    var target = undoLayer === "paint" ? paintCanvas : strokeCanvas;
    var tctx = undoLayer === "paint" ? pctx : sctx;
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, target.width, target.height);
    tctx.drawImage(undoCanvas, 0, 0);
    tctx.restore();
    totalDist = undoDist;
    if (undoLayer === "stroke") alphaDirty = true;
    clearUndo();
    tone(340, 0.08, 0.04);
  }

  function clearUndo() {
    undoLayer = null;
    syncUndo();
  }

  function syncUndo() {
    undoTool.disabled = !undoLayer || phase === "finished";
  }

  // ---------- flood fill ----------
  /* Boundaries come from the stroke layer's alpha only — one channel, one
     threshold, no RGB tolerance to tune. Because fills go on the layer
     underneath, the antialiased skirt of a line is hidden by the line itself,
     and refilling a region is not a special case: the mask is recomputed from
     the strokes and never sees the previous fill colour. */
  var W = 0, H = 0;
  var strokeAlpha = null;   // Uint8Array(W*H), the stroke layer's alpha plane
  var fillMask = null;      // Uint8Array(W*H)
  var stack = [];           // seed indices; a plain array so it cannot overflow
  var alphaDirty = true;

  function allocFillBuffers() {
    W = strokeCanvas.width;
    H = strokeCanvas.height;
    strokeAlpha = new Uint8Array(W * H);
    fillMask = new Uint8Array(W * H);
    alphaDirty = true;
  }

  function snapshotStrokeAlpha() {
    /* Same-origin only. Nothing from another origin is ever drawn onto these
       layers, so getImageData cannot taint — keep it that way. */
    var data = sctx.getImageData(0, 0, W, H).data;
    for (var i = 0, p = 3; i < strokeAlpha.length; i++, p += 4) {
      strokeAlpha[i] = data[p];
    }
  }

  function isOpen(i) {
    return strokeAlpha[i] < ALPHA_TOL && fillMask[i] === 0;
  }

  function scanRow(rowStart, xl, xr) {
    var k = xl;
    while (k <= xr) {
      while (k <= xr && !isOpen(rowStart + k)) k++;
      if (k > xr) break;
      stack.push(rowStart + k);
      while (k <= xr && isOpen(rowStart + k)) k++;
    }
  }

  // Scanline span fill, explicit stack, no recursion.
  function computeRegion(px, py) {
    var seed = py * W + px;
    if (strokeAlpha[seed] >= ALPHA_TOL) return 0;
    var count = 0;
    stack.length = 0;
    stack.push(seed);
    while (stack.length) {
      var i = stack.pop();
      if (fillMask[i]) continue;
      var y = (i / W) | 0;
      var rowStart = y * W;
      var xl = i - rowStart, xr = xl;
      while (xl > 0 && isOpen(rowStart + xl - 1)) xl--;
      while (xr < W - 1 && isOpen(rowStart + xr + 1)) xr++;
      for (var k = xl; k <= xr; k++) {
        fillMask[rowStart + k] = 1;
        count++;
      }
      if (y > 0) scanRow(rowStart - W, xl, xr);
      if (y < H - 1) scanRow(rowStart + W, xl, xr);
    }
    return count;
  }

  function paintRegion(css) {
    var img = pctx.getImageData(0, 0, W, H);
    var d = img.data;
    var rgb = parseColor(css);
    for (var i = 0, p = 0; i < fillMask.length; i++, p += 4) {
      if (fillMask[i]) {
        d[p] = rgb.r;
        d[p + 1] = rgb.g;
        d[p + 2] = rgb.b;
        d[p + 3] = 255;
      }
    }
    pctx.putImageData(img, 0, 0);
  }

  function bucketAt(cssX, cssY) {
    var px = Math.min(W - 1, Math.max(0, Math.round(cssX * dpr)));
    var py = Math.min(H - 1, Math.max(0, Math.round(cssY * dpr)));

    if (alphaDirty) {
      snapshotStrokeAlpha();
      alphaDirty = false;
    }
    // A tap that landed on a line does nothing. Read it from the snapshot
    // rather than a second getImageData: repeated fills between strokes then
    // cost no readback of the stroke layer at all.
    if (strokeAlpha[py * W + px] >= ALPHA_TOL) {
      tone(200, 0.06, 0.025);
      return;
    }
    fillMask.fill(0);
    if (!computeRegion(px, py)) return;

    captureUndo("paint");
    paintRegion(fillColor());
    tone(520, 0.07, 0.035);
  }

  // ---------- timer ----------
  function msLeft() {
    if (phase === "idle") return ROUND_MS;
    if (phase === "finished") return finalLeft;
    return Math.max(0, deadline - Date.now());
  }

  function renderTimer() {
    var left = msLeft();
    var s = Math.ceil(left / 1000);
    if (s !== lastShown) {
      lastShown = s;
      timerVal.textContent = "0:" + (s < 10 ? "0" : "") + s;
    }
    var urgent = phase === "playing" && left <= URGENT_MS;
    timerPill.classList.toggle("urgent", urgent);
    timerBar.classList.toggle("urgent", urgent);
  }

  function tickTimer() {
    var left = msLeft();
    renderTimer();
    if (left > 0 && left <= 3000) {
      var s = Math.ceil(left / 1000);
      if (s !== lastBeep) {
        lastBeep = s;
        tone(660, 0.07, 0.035);
      }
    }
    if (left <= 0) finishRound();
  }

  function startTimer() {
    phase = "playing";
    deadline = Date.now() + ROUND_MS;
    lastBeep = -1;
    pauseCount = 0;
    clearInterval(timerHandle);
    timerHandle = setInterval(tickTimer, 250);
    timerBar.style.animationPlayState = "";
    timerBar.classList.add("run");
    renderTimer();
  }

  /* freeze leaves the hairline where it stopped, so the overlay quietly shows
     how much time was left when the player hit Done. */
  function stopTimer(freeze) {
    clearInterval(timerHandle);
    timerHandle = null;
    if (freeze) {
      timerBar.style.animationPlayState = "paused";
    } else {
      timerBar.classList.remove("run");
      timerBar.style.animationPlayState = "";
    }
  }

  /* Held while the tab is hidden and while the how-to sheet is open. No other
     game here touches visibilitychange, but this is the only one where being
     away costs the player something: a backgrounded interval fires late but
     still fires, so without this you come back to a finished round. Reading
     the rules must not burn the clock either. Counted, because both can hold
     it at once. */
  function holdTimer() {
    if (phase !== "playing") return;
    pauseCount++;
    if (pauseCount > 1) return;
    pausedAt = Date.now();
    clearInterval(timerHandle);
    timerHandle = null;
    timerBar.style.animationPlayState = "paused";
  }

  function releaseTimer() {
    if (phase !== "playing" || pauseCount === 0) return;
    pauseCount--;
    if (pauseCount > 0) return;
    deadline += Date.now() - pausedAt;
    timerHandle = setInterval(tickTimer, 250);
    timerBar.style.animationPlayState = "";
    tickTimer();
  }

  // ---------- drawing ----------
  function drawDot(p) {
    sctx.fillStyle = strokeColorFor(totalDist);
    sctx.beginPath();
    sctx.arc(p.x, p.y, LINE_WIDTH * 0.5, 0, Math.PI * 2);
    sctx.fill();
  }

  function renderSegment(a, b) {
    totalDist += Math.hypot(b.x - a.x, b.y - a.y);
    sctx.strokeStyle = strokeColorFor(totalDist);
    sctx.beginPath();
    sctx.moveTo(a.x, a.y);
    sctx.lineTo(b.x, b.y);
    sctx.stroke();
  }

  function beginStroke(e) {
    if (phase === "finished") return;
    var p = localPoint(e);

    if (phase === "idle") {
      idlePrompt.classList.add("hide");
      // The nudge has done its job the moment the player starts.
      promptText.classList.remove("nudge");
      startTimer();
    }

    if (tool === "paint") {
      bucketAt(p.x, p.y);
      return;
    }

    if (drawing) return;
    drawing = true;
    activePointerId = e.pointerId;
    try { strokeCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    captureUndo("stroke");
    lastRaw = p;
    drawDot(p);
  }

  function continueStroke(e) {
    if (!drawing || e.pointerId !== activePointerId) return;
    var p = localPoint(e);
    renderSegment(lastRaw, p);
    lastRaw = p;
  }

  function endStroke(e) {
    if (!drawing || e.pointerId !== activePointerId) return;
    drawing = false;
    activePointerId = null;
    alphaDirty = true; // the fill boundaries just changed
  }

  // ---------- tools ----------
  function setTool(t) {
    tool = t;
    pencilTool.classList.toggle("is-active", t === "pencil");
    paintTool.classList.toggle("is-active", t === "paint");
    pencilTool.setAttribute("aria-pressed", t === "pencil" ? "true" : "false");
    paintTool.setAttribute("aria-pressed", t === "paint" ? "true" : "false");
    strokeCanvas.classList.toggle("paint-mode", t === "paint");
  }

  function setSwatch(i) {
    swatch = i;
    var chips = swatchesEl.children;
    for (var j = 0; j < chips.length; j++) {
      chips[j].classList.toggle("is-active", j === i);
      chips[j].setAttribute("aria-checked", j === i ? "true" : "false");
    }
  }

  function buildSwatches() {
    SWATCHES.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c === "rainbow" ? " swatch-rainbow" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", SWATCH_NAMES[i]);
      if (c !== "rainbow") b.style.setProperty("--chip", c);
      b.appendChild(document.createElement("i"));
      b.addEventListener("click", function () { setSwatch(i); });
      swatchesEl.appendChild(b);
    });
    setSwatch(0);
  }

  /* Wipes the drawing but keeps the round: same prompt, same shape, clock
     still running. Starting over is the other button. */
  function clearDrawing() {
    if (phase === "finished") return;
    sctx.clearRect(0, 0, cssW, cssH);
    pctx.clearRect(0, 0, cssW, cssH);
    totalDist = 0;
    stampShape();
    clearUndo();
    tone(300, 0.07, 0.03);
  }

  // ---------- round lifecycle ----------
  function newRound() {
    clearTimeout(finishTimer);
    stopTimer(false);
    phase = "idle";
    round = pickRound();
    promptShape.textContent = round.label;
    promptDir.textContent = round.direction;

    drawing = false;
    activePointerId = null;
    totalDist = 0;
    lastShown = -1;
    lastBeep = -1;
    pauseCount = 0;

    layers.classList.remove("finished", "presented");
    toolbar.classList.remove("locked");
    overlay.classList.remove("show");
    shareNote.classList.remove("show");
    idlePrompt.classList.remove("hide");
    promptText.classList.add("nudge");

    resizeCanvas(false); // re-sizing blanks both layers, then stamps the shape
    renderTimer();
  }

  function finishRound() {
    if (phase === "finished") return;
    finalLeft = msLeft(); // while the phase still says "playing"
    phase = "finished";
    drawing = false;
    stopTimer(true);
    renderTimer();
    syncUndo();
    toolbar.classList.add("locked");
    sndEnd();

    overlayTitle.textContent = "YOU MADE THIS";
    overlaySub.textContent =
      round.label.charAt(0).toUpperCase() + round.label.slice(1) + " → " + round.direction;

    var reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      finishTimer = setTimeout(showOverlay, 120);
    } else {
      layers.classList.add("finished");
      finishTimer = setTimeout(function () {
        /* Hand off from the one-shot swirl to the slow drift. Both keyframes
           begin and end at the identity transform, so the swap is seamless. */
        layers.classList.remove("finished");
        layers.classList.add("presented");
        showOverlay();
      }, FINISH_MS);
    }
  }

  function showOverlay() { endCard.show(); }

  // ---------- share ----------
  function shareBackground(octx, SIZE) {
    var g = octx.createRadialGradient(SIZE * 0.28, SIZE * 0.2, 10, SIZE * 0.5, SIZE * 0.5, SIZE * 0.78);
    if (isDark()) {
      g.addColorStop(0, "#232049");
      g.addColorStop(0.45, "#191735");
      g.addColorStop(1, "#0d0e1a");
    } else {
      g.addColorStop(0, "#fbf6ea");
      g.addColorStop(0.45, "#f3ecd9");
      g.addColorStop(1, "#e2d1ac");
    }
    octx.fillStyle = g;
    octx.fillRect(0, 0, SIZE, SIZE);
  }

  function panelPath(octx, x, y, w, h) {
    octx.beginPath();
    if (octx.roundRect) octx.roundRect(x, y, w, h, 18);
    else octx.rect(x, y, w, h);
  }

  /* The canvas layers are transparent, so the share image has to paint the
     paper itself — otherwise the doodle would sit straight on the sparkle
     background and dark-theme strokes would vanish. */
  function drawSharePaper(octx, x, y, w, h) {
    var dark = isDark();
    var s = w / cssW;
    octx.save();
    panelPath(octx, x, y, w, h);
    octx.fillStyle = dark ? "#14132a" : "#fdfbf6";
    octx.fill();
    octx.clip();
    var step = 22 * s;
    if (step >= 8) {
      octx.fillStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(43,38,32,0.10)";
      var r = Math.max(0.9, 1.2 * s);
      for (var gy = y + step / 2; gy < y + h; gy += step) {
        for (var gx = x + step / 2; gx < x + w; gx += step) {
          octx.beginPath();
          octx.arc(gx, gy, r, 0, Math.PI * 2);
          octx.fill();
        }
      }
    }
    octx.restore();
  }

  function buildShareCanvas() {
    var SIZE = 800;
    var off = document.createElement("canvas");
    off.width = SIZE;
    off.height = SIZE;
    var octx = off.getContext("2d");
    var dark = isDark();

    shareBackground(octx, SIZE);
    drawSparkles(octx, SIZE);

    /* Letterbox the whole canvas rect, not the drawing's bounding box. The
       starting shape is centred, and where the player put things relative to
       it is the entire content of the round — recentring on the ink would
       throw that away. */
    var topPad = 150, bottomPad = 130, sidePad = 70;
    var availW = SIZE - sidePad * 2;
    var availH = SIZE - topPad - bottomPad;
    var scale = Math.min(availW / cssW, availH / cssH);
    var w = cssW * scale, h = cssH * scale;
    var x = (SIZE - w) / 2;
    var y = topPad + (availH - h) / 2;

    drawSharePaper(octx, x, y, w, h);
    octx.save();
    panelPath(octx, x, y, w, h);
    octx.clip();
    octx.drawImage(paintCanvas, x, y, w, h);
    octx.drawImage(strokeCanvas, x, y, w, h);
    octx.restore();

    // wordmark
    octx.textAlign = "center";
    octx.fillStyle = dark ? "#f0eefa" : "#2b2620";
    octx.font = "800 40px -apple-system, Helvetica, Arial, sans-serif";
    var w1 = octx.measureText("DOODLE ").width;
    var w2 = octx.measureText("ON").width;
    var startX = SIZE / 2 - (w1 + w2) / 2;
    octx.textAlign = "left";
    octx.fillText("DOODLE ", startX, 66);
    var onGrad = octx.createLinearGradient(startX + w1, 0, startX + w1 + w2, 0);
    onGrad.addColorStop(0, dark ? "#ff4fc4" : "#ff5f96");
    onGrad.addColorStop(1, dark ? "#b06bff" : "#7c5cff");
    octx.fillStyle = onGrad;
    octx.fillText("ON", startX + w1, 66);

    // the prompt is the caption: it is what makes the picture make sense
    octx.textAlign = "center";
    octx.fillStyle = dark ? "#b06bff" : "#7c5cff";
    var cap = (round.label + " → " + round.direction).toUpperCase();
    var size = 22;
    octx.font = "700 " + size + "px -apple-system, Helvetica, Arial, sans-serif";
    while (size > 15 && octx.measureText(cap).width > 660) {
      size -= 1;
      octx.font = "700 " + size + "px -apple-system, Helvetica, Arial, sans-serif";
    }
    octx.fillText(cap, SIZE / 2, 106);

    octx.fillStyle = dark ? "#f0eefa" : "#2b2620";
    octx.font = "700 20px -apple-system, Helvetica, Arial, sans-serif";
    octx.fillText("30 seconds. What would you draw?", SIZE / 2, SIZE - 40);

    return off;
  }

  function drawSparkles(octx, SIZE) {
    var sparkles = [
      { x: 0.14, y: 0.16, s: 10, c: "#ff5f96" },
      { x: 0.86, y: 0.13, s: 8, c: "#7c5cff" },
      { x: 0.92, y: 0.5, s: 9, c: "#2ee6b8" },
      { x: 0.08, y: 0.58, s: 7, c: "#ffd93d" },
      { x: 0.2, y: 0.88, s: 8, c: "#ff9a3d" },
      { x: 0.82, y: 0.86, s: 10, c: "#7c5cff" }
    ];
    sparkles.forEach(function (sp) {
      drawSparkle(octx, sp.x * SIZE, sp.y * SIZE, sp.s, sp.c);
    });
  }

  function drawSparkle(octx, x, y, r, color) {
    octx.fillStyle = color;
    octx.beginPath();
    octx.moveTo(x, y - r);
    octx.quadraticCurveTo(x, y, x + r, y);
    octx.quadraticCurveTo(x, y, x, y + r);
    octx.quadraticCurveTo(x, y, x - r, y);
    octx.quadraticCurveTo(x, y, x, y - r);
    octx.fill();
  }

  function showShareNote(text) {
    shareNote.textContent = text;
    shareNote.classList.add("show");
  }

  function shareResult() {
    var off = buildShareCanvas();
    var prompt = round.label + " → " + round.direction;
    off.toBlob(function (blob) {
      if (!blob) return;
      var file;
      try { file = new File([blob], "doodle-on.png", { type: "image/png" }); } catch (e) { file = null; }

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: "Doodle On",
          text: "30 seconds to turn a " + prompt + ". Your turn:"
        }).catch(function () {});
        return;
      }
      if (navigator.share) {
        navigator.share({
          title: "Doodle On",
          text: "Get a shape, get an idea, 30 seconds to draw it. Doodle On.",
          url: location.origin + "/doodle-on/"
        }).catch(function () {});
        return;
      }

      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "doodle-on.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      showShareNote("Saved");
    }, "image/png");
  }

  // ---------- wiring ----------
  strokeCanvas.addEventListener("pointerdown", beginStroke);
  strokeCanvas.addEventListener("pointermove", continueStroke);
  strokeCanvas.addEventListener("pointerup", endStroke);
  strokeCanvas.addEventListener("pointercancel", endStroke);

  pencilTool.addEventListener("click", function () { setTool("pencil"); });
  paintTool.addEventListener("click", function () { setTool("paint"); });
  undoTool.addEventListener("click", undo);
  clearTool.addEventListener("click", clearDrawing);
  doneBtn.addEventListener("click", function () { finishRound(); });

  restartBtn.addEventListener("click", newRound);
  againBtn.addEventListener("click", newRound);
  shareBtn.addEventListener("click", shareResult);
  // The round clock must not run while the sheet covers the board.
  initHowto({ onOpen: holdTimer, onClose: releaseTimer });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) holdTimer(); else releaseTimer();
  });

  /* Watch the box rather than the window: it is the drawing surface's own size
     that matters, and an iOS URL-bar collapse changes it without a resize
     event worth trusting. Debounced, because every callback costs a
     snapshot-and-restore of both layers. */
  function onBoxResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resizeCanvas(true); }, 150);
  }
  if (window.ResizeObserver) new ResizeObserver(onBoxResize).observe(canvasWrap);
  else window.addEventListener("resize", onBoxResize);

  buildSwatches();
  setTool("pencil");
  newRound();
})();
