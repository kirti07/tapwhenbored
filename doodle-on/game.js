(function () {
  "use strict";

  // ---------- tuning ----------
  var LINE_WIDTH = 3;  // px, CSS space
  var STEP = 5;           // resample interval along the stroke, kept for a clean share-image redraw
  var PALETTE = ["#ff9a3d", "#ff5f96", "#a970ff", "#4fb8ff", "#2ee6b8", "#ffd93d"];
  var STOP_DIST = 130;    // px of drawn distance per palette stop, then it loops

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  var PALETTE_RGB = PALETTE.map(hexToRgb);

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

  var canvasWrap = document.getElementById("canvasWrap");
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");
  var idlePrompt = document.getElementById("idlePrompt");
  var restartBtn = document.getElementById("restartBtn");
  var overlay = document.getElementById("overlay");
  var overlaySub = document.getElementById("overlaySub");
  var againBtn = document.getElementById("againBtn");
  var shareBtn = document.getElementById("shareBtn");
  var shareNote = document.getElementById("shareNote");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");

  var dpr = 1;
  var cssW = 0, cssH = 0;
  var drawing = false;
  var ended = false;
  var points = [];          // committed points, resampled at fixed STEP spacing (used for the share image)
  var lastCommitted = null; // {x,y} — tail of the resampling walk
  var lastRaw = null;       // {x,y} — for live rendering between raw pointer events
  var activePointerId = null;
  var totalDist = 0;        // cumulative drawn distance, drives the rainbow color cycle

  // ---------- tiny procedural audio, no assets ----------
  var actx = null;
  function actxGet() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
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

  // ---------- canvas sizing ----------
  function resizeCanvas() {
    var rect = canvasWrap.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function localPoint(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (x < 0) x = 0; else if (x > cssW) x = cssW;
    if (y < 0) y = 0; else if (y > cssH) y = cssH;
    return { x: x, y: y };
  }

  function processMove(x, y) {
    if (!lastCommitted) { lastCommitted = { x: x, y: y }; return; }
    var cx = lastCommitted.x, cy = lastCommitted.y;
    var dx = x - cx, dy = y - cy;
    var dist = Math.hypot(dx, dy);
    while (dist >= STEP) {
      var t = STEP / dist;
      cx += dx * t; cy += dy * t;
      points.push({ x: cx, y: cy });
      dx = x - cx; dy = y - cy;
      dist = Math.hypot(dx, dy);
    }
    lastCommitted = { x: cx, y: cy };
  }

  function renderSegment(a, b) {
    totalDist += Math.hypot(b.x - a.x, b.y - a.y);
    ctx.strokeStyle = colorForDistance(totalDist);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawStartDot(p) {
    ctx.fillStyle = PALETTE[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, LINE_WIDTH * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- game flow ----------
  function beginStroke(e) {
    if (ended || drawing) return;
    var p = localPoint(e);
    drawing = true;
    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    idlePrompt.classList.add("hide");

    points = [p];
    lastCommitted = p;
    lastRaw = p;
    totalDist = 0;
    drawStartDot(p);
  }

  function continueStroke(e) {
    if (!drawing || e.pointerId !== activePointerId) return;
    var p = localPoint(e);
    renderSegment(lastRaw, p);
    lastRaw = p;
    processMove(p.x, p.y);
  }

  function endStroke(e) {
    if (!drawing || e.pointerId !== activePointerId) return;
    drawing = false;
    gameOver();
  }

  function gameOver() {
    if (ended) return;
    ended = true;
    drawing = false;
    sndEnd();
    overlaySub.textContent = "You lifted your finger.";
    shareNote.classList.remove("show");
    setTimeout(function () { overlay.classList.add("show"); }, 200);
  }

  function reset() {
    ended = false;
    drawing = false;
    points = [];
    lastCommitted = null;
    lastRaw = null;
    activePointerId = null;
    totalDist = 0;
    overlay.classList.remove("show");
    idlePrompt.classList.remove("hide");
    resizeCanvas();
    ctx.clearRect(0, 0, cssW, cssH);
  }

  // ---------- share ----------
  function buildShareCanvas() {
    var SIZE = 800;
    var off = document.createElement("canvas");
    off.width = SIZE;
    off.height = SIZE;
    var octx = off.getContext("2d");

    var g = octx.createRadialGradient(SIZE * 0.28, SIZE * 0.2, 10, SIZE * 0.5, SIZE * 0.5, SIZE * 0.78);
    g.addColorStop(0, "#fbf6ea");
    g.addColorStop(0.45, "#f3ecd9");
    g.addColorStop(1, "#e2d1ac");
    octx.fillStyle = g;
    octx.fillRect(0, 0, SIZE, SIZE);

    drawSparkles(octx, SIZE);

    if (points.length > 1) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      var w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
      var topPad = 130, bottomPad = 110, sidePad = 80;
      var avail = SIZE - sidePad * 2;
      var availH = SIZE - topPad - bottomPad;
      var scale = Math.min(avail / w, availH / h);
      var offsetX = (SIZE - w * scale) / 2 - minX * scale;
      var offsetY = topPad + (availH - h * scale) / 2 - minY * scale;
      var lw = Math.max(3, LINE_WIDTH * scale * 0.9);

      octx.lineCap = "round";
      octx.lineJoin = "round";
      octx.lineWidth = lw;
      var dist = 0;
      for (var j = 1; j < points.length; j++) {
        var ax = points[j - 1].x * scale + offsetX, ay = points[j - 1].y * scale + offsetY;
        var bx = points[j].x * scale + offsetX, by = points[j].y * scale + offsetY;
        dist += Math.hypot(points[j].x - points[j - 1].x, points[j].y - points[j - 1].y);
        octx.strokeStyle = colorForDistance(dist);
        octx.beginPath();
        octx.moveTo(ax, ay);
        octx.lineTo(bx, by);
        octx.stroke();
      }
      octx.fillStyle = PALETTE[0];
      octx.beginPath();
      octx.arc(points[0].x * scale + offsetX, points[0].y * scale + offsetY, lw * 0.85, 0, Math.PI * 2);
      octx.fill();
    }

    octx.textAlign = "center";
    octx.fillStyle = "#2b2620";
    octx.font = "800 40px -apple-system, Helvetica, Arial, sans-serif";
    var w1 = octx.measureText("DOODLE ").width;
    var w2 = octx.measureText("ON").width;
    var startX = SIZE / 2 - (w1 + w2) / 2;
    octx.textAlign = "left";
    octx.fillText("DOODLE ", startX, 66);
    var onGrad = octx.createLinearGradient(startX + w1, 0, startX + w1 + w2, 0);
    onGrad.addColorStop(0, "#ff5f96");
    onGrad.addColorStop(1, "#7c5cff");
    octx.fillStyle = onGrad;
    octx.fillText("ON", startX + w1, 66);

    octx.textAlign = "center";
    octx.fillStyle = "#7c5cff";
    octx.font = "700 22px -apple-system, Helvetica, Arial, sans-serif";
    octx.fillText("I didn't lift!", SIZE / 2, 104);

    octx.fillStyle = "#2b2620";
    octx.font = "700 20px -apple-system, Helvetica, Arial, sans-serif";
    octx.fillText("Can you doodle longer?", SIZE / 2, SIZE - 40);

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
    off.toBlob(function (blob) {
      if (!blob) return;
      var file;
      try { file = new File([blob], "doodle-on.png", { type: "image/png" }); } catch (e) { file = null; }

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: "Doodle On",
          text: "Try doodling this without lifting your finger!"
        }).catch(function () {});
        return;
      }
      if (navigator.share) {
        navigator.share({
          title: "Doodle On",
          text: "Try doodling without lifting your finger on Doodle On.",
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

  // ---------- how to play ----------
  function openHowto() {
    howtoSheet.classList.add("show");
    howtoBackdrop.classList.add("show");
  }
  function closeHowto() {
    howtoSheet.classList.remove("show");
    howtoBackdrop.classList.remove("show");
  }

  // ---------- wiring ----------
  canvas.addEventListener("pointerdown", beginStroke);
  canvas.addEventListener("pointermove", continueStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  restartBtn.addEventListener("click", reset);
  againBtn.addEventListener("click", reset);
  shareBtn.addEventListener("click", shareResult);
  howtoBtn.addEventListener("click", openHowto);
  howtoBackdrop.addEventListener("click", closeHowto);

  window.addEventListener("resize", function () {
    if (!drawing && !ended) resizeCanvas();
  });

  resizeCanvas();
})();
