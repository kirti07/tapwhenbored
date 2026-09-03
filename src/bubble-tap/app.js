import { renderGlobalBest } from "../shared/ui/leaderboard.js";

(() => {
  "use strict";

  // ---------- config ----------
  const CONFIG = {
    minSize: 42,
    maxSize: 104,
    baseValue: 10,
    speedRange: [0.022, 0.06],
    // bubble count is never a fixed number — it's derived from screen area
    // (bigger screen = more room = more bubbles) and grows as you play, up to
    // maxDensityMultiplier. That cap exists only so bubbles stay big enough to
    // tap accurately and phones don't choke — not an arbitrary "15".
    areaPerBubble: 9000,
    densityGrowthPerTap: 0.006,
    maxDensityMultiplier: 3.2,
    comboWindowMs: 900,
    maxCombo: 12,
    // bomb "tell" — a slower, faintly wobbly drift.
    bombSpeedMul: 0.6,
    bombWobbleAmp: 1.6,
    // four-state model: safe (purple) bubbles are always safe to pop, worth
    // 1x. Neutral bubbles (a few decorative colors) are unresolved — tapping
    // one reveals it as safe or unstable in place, also worth 1x, and needs
    // a second tap to actually clear it. Unstable (yellow) bubbles pop for 0
    // points but can convert nearby safe bubbles into bombs. Bombs only
    // ever come from the initial board setup or from an unstable-bubble
    // conversion — never a recurring wave.
    unstableChance: 0.12,
    neutralChance: 0.4,
    neutralResolveUnstableChance: 0.5,
    safeValueMul: 1,
    neutralValueMul: 1,
    unstableValueMul: 0,
    initialBombPct: 0.04,
    unstableRadiusFraction: 0.16,
    // conversions on an unstable tap scale with the smaller screen
    // dimension — bigger screens have more room, so more bubbles convert.
    unstableConvertMin: 2,
    unstableConvertDivisor: 400,
    unstableConvertMax: 4,
  };

  const NEUTRAL_COLOR_CLASSES = ["c0", "c1", "c3", "c5"];

  // ---------- dom ----------
  const playfield = document.getElementById("playfield");
  const scoreEl = document.getElementById("scoreVal");
  const tapsEl = document.getElementById("tapsVal");
  const challengeBanner = document.getElementById("challengeBanner");

  const pauseBtn = document.getElementById("pauseBtn");
  const pauseIcon = document.getElementById("pauseIcon");
  const playIcon = document.getElementById("playIcon");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");

  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const bestScoreEl = document.getElementById("bestScore");
  const globalScoreEl = document.getElementById("globalBest");
  const restartBtn = document.getElementById("restartBtn");
  const shareBtn = document.getElementById("shareBtn");
  const restartFromSettingsBtn = document.getElementById("restartFromSettingsBtn");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const soundToggle = document.getElementById("soundToggle");
  const motionToggle = document.getElementById("motionToggle");
  const howtoBtn = document.getElementById("howtoBtn");
  const howtoSheet = document.getElementById("howtoSheet");
  const howtoBackdrop = document.getElementById("howtoBackdrop");

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pad = (n, w) => String(n).padStart(w, "0");
  const loadFlag = (key, def) => {
    const v = localStorage.getItem(key);
    return v === null ? def : v === "true";
  };

  // ---------- state ----------
  const state = {
    score: 0,
    taps: 0,
    paused: false,
    gameOver: false,
    soundOn: loadFlag("twb_sound", true),
    calmMode: loadFlag("twb_calm", false),
    combo: 0,
    lastPopAt: 0,
  };

  let bubbles = [];
  let idSeq = 0;
  let pfW = 0, pfH = 0;
  let lastT = null;
  let rafId = null;
  let topUpAcc = 0;

  // ---------- audio ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function playPop(combo) {
    if (!state.soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    const comboLift = Math.min(combo || 1, 10) * 14;
    o.frequency.setValueAtTime(560 + Math.random() * 220 + comboLift, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.09);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.11);
  }
  function playBoom() {
    if (!state.soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const dur = 0.45;
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700, t);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(filter);
    filter.connect(g);
    g.connect(audioCtx.destination);
    noise.start(t);
  }
  // ---------- stats ----------
  function updateStats() {
    scoreEl.textContent = pad(state.score, 5);
    tapsEl.textContent = pad(state.taps, 2);
  }

  // ---------- bubble factory ----------
  function measurePlayfield() {
    const r = playfield.getBoundingClientRect();
    pfW = r.width;
    pfH = r.height;
  }

  function pickSpawnPos(size) {
    let best = { x: rand(0, Math.max(1, pfW - size)), y: rand(0, Math.max(1, pfH - size)) };
    let bestScore = -1;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = rand(0, Math.max(1, pfW - size));
      const y = rand(0, Math.max(1, pfH - size));
      let minDist = Infinity;
      for (const b of bubbles) {
        const dx = x - b.x, dy = y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
      if (minDist === Infinity) { best = { x, y }; break; }
      if (minDist > bestScore) { bestScore = minDist; best = { x, y }; }
    }
    return best;
  }

  function targetBubbleCount() {
    const area = Math.max(1, pfW * pfH);
    const densityMul = Math.min(CONFIG.maxDensityMultiplier, 1 + state.taps * CONFIG.densityGrowthPerTap);
    return Math.max(8, Math.round((area / CONFIG.areaPerBubble) * densityMul));
  }

  function topUpBubbles() {
    if (state.gameOver) return;
    const target = targetBubbleCount();
    let guard = 0;
    while (bubbles.filter((b) => !b.isBomb).length < target && guard < 200) {
      spawnNormal();
      guard++;
    }
  }

  function spawnNormal() {
    const r = Math.random();
    const kind =
      r < CONFIG.unstableChance
        ? "unstable"
        : r < CONFIG.unstableChance + CONFIG.neutralChance
        ? "neutral"
        : "normal";
    return createBubble(kind);
  }

  const BOMB_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="42%" height="42%"><circle cx="11" cy="14" r="7" fill="currentColor"/>' +
    '<path d="M11 7 L13.2 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
    '<circle cx="13.6" cy="2.6" r="1.5" fill="currentColor"/></svg>';

  function createBubble(kind) {
    const isBomb = kind === "bomb";
    const isUnstable = kind === "unstable";
    const isNeutral = kind === "neutral";
    // bombs are sized exactly like other bubbles — no free tell there.
    // The only tell is a slower, faintly wobbly drift.
    const size = rand(CONFIG.minSize, CONFIG.maxSize);
    const pos = pickSpawnPos(size);
    const calmMul = state.calmMode ? 0.35 : 1;
    const progressMul = 1 + Math.min(1, state.taps / 500) * 0.2;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(...CONFIG.speedRange) * calmMul * progressMul * (isBomb ? CONFIG.bombSpeedMul : 1);

    const el = document.createElement("div");
    // safe bubbles are always purple (c2), unstable bubbles are always
    // yellow (c4), neutral bubbles get one of a few decorative colors —
    // color is the only state tell, no ring/size difference.
    const colorClass = isUnstable
      ? "c4"
      : isNeutral
      ? NEUTRAL_COLOR_CLASSES[randInt(0, NEUTRAL_COLOR_CLASSES.length - 1)]
      : "c2";
    el.className = "bubble spawning" + (isBomb ? " bomb" : " " + colorClass);
    el.style.width = size + "px";
    el.style.height = size + "px";
    const shell = document.createElement("div");
    shell.className = "shell";
    const hi = document.createElement("div");
    hi.className = "highlight";
    el.appendChild(shell);
    el.appendChild(hi);
    if (isBomb) {
      const icon = document.createElement("div");
      icon.className = "bomb-icon";
      icon.innerHTML = BOMB_ICON_SVG;
      el.appendChild(icon);
    }
    playfield.appendChild(el);

    const bubble = {
      id: ++idSeq,
      el,
      x: pos.x,
      y: pos.y,
      size,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      isBomb,
      isUnstable,
      isNeutral,
      age: 0,
      wobblePhase: rand(0, Math.PI * 2),
      dead: false,
    };
    el.dataset.id = bubble.id;
    bubbles.push(bubble);
    applyTransform(bubble);
    setTimeout(() => el.classList.remove("spawning"), 340);
    return bubble;
  }

  function applyTransform(b) {
    let x = b.x;
    let y = b.y;
    if (b.isBomb) {
      x += Math.sin(b.age * 0.004 + b.wobblePhase) * CONFIG.bombWobbleAmp;
      y += Math.cos(b.age * 0.0037 + b.wobblePhase) * CONFIG.bombWobbleAmp;
    }
    const tf = `translate(${x}px, ${y}px)`;
    b.el.style.setProperty("--tf", tf);
    b.el.style.transform = tf;
  }

  function removeBubbleEl(b, delay) {
    setTimeout(() => {
      if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
    }, delay);
  }

  // ---------- float text ----------
  function showFloatText(x, y, text) {
    const span = document.createElement("span");
    span.className = "float-pop";
    span.textContent = text;
    span.style.left = x + "px";
    span.style.top = y + "px";
    playfield.appendChild(span);
    setTimeout(() => span.remove(), 780);
  }

  function showBurstRing(x, y, size) {
    const ring = document.createElement("div");
    ring.className = "pop-ring";
    ring.style.left = x + "px";
    ring.style.top = y + "px";
    ring.style.width = size + "px";
    ring.style.height = size + "px";
    playfield.appendChild(ring);
    setTimeout(() => ring.remove(), 520);
  }

  function screenFlash() {
    const el = document.createElement("div");
    el.className = "screen-flash";
    playfield.appendChild(el);
    setTimeout(() => el.remove(), 420);
  }

  // ---------- game actions ----------
  // Base "1x" value — safe and neutral taps both use it as-is; unstable
  // taps scale it down to 0 via scoreTap.
  function valueForBubble() {
    const variance = 0.85 + Math.random() * 0.3;
    const v = CONFIG.baseValue * variance;
    return Math.max(5, Math.round(v / 5) * 5);
  }

  // Shared combo/score bookkeeping for any tap that scores — a full pop or
  // a neutral reveal alike — so combo rhythm tracks every tap uniformly
  // regardless of which tier's multiplier it happens to land on.
  function scoreTap(mul) {
    const now = Date.now();
    state.combo = now - state.lastPopAt < CONFIG.comboWindowMs ? Math.min(state.combo + 1, CONFIG.maxCombo) : 1;
    state.lastPopAt = now;
    const comboMul = 1 + (state.combo - 1) * 0.05;
    const gained = Math.round(valueForBubble() * mul * comboMul);
    state.taps++;
    state.score += gained;
    return gained;
  }

  function popNormal(b, mul) {
    b.dead = true;
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const gained = scoreTap(mul);

    const label = state.combo >= 3 ? `+${gained} ×${state.combo}` : `+${gained}`;
    showFloatText(cx, cy, label);
    showBurstRing(cx, cy, b.size);
    b.el.classList.add("popping");
    ensureAudio();
    playPop(state.combo);
    bubbles = bubbles.filter((x) => x !== b);
    removeBubbleEl(b, 300);
    updateStats();
    setTimeout(topUpBubbles, 220);
  }

  // Tapping a neutral bubble doesn't clear it — it reveals as safe or
  // unstable in place (worth the neutral 1x tier), and needs a second tap
  // to actually resolve for that color's own reward.
  function revealNeutral(b) {
    b.isNeutral = false;
    b.isUnstable = Math.random() < CONFIG.neutralResolveUnstableChance;
    b.el.classList.remove(...NEUTRAL_COLOR_CLASSES);
    b.el.classList.add(b.isUnstable ? "c4" : "c2");

    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const gained = scoreTap(CONFIG.neutralValueMul);
    const label = state.combo >= 3 ? `+${gained} ×${state.combo}` : `+${gained}`;
    showFloatText(cx, cy, label);
    ensureAudio();
    playPop(state.combo);
    updateStats();
  }

  // One-time starting batch, sized to the board — bombs otherwise only ever
  // appear via an unstable-bubble conversion, never a recurring wave.
  function spawnInitialBombs() {
    const count = Math.max(1, Math.round(targetBubbleCount() * CONFIG.initialBombPct));
    for (let i = 0; i < count; i++) createBubble("bomb");
  }

  // Interaction radius/cap for unstable-bubble conversions — both scale
  // with the smaller playfield dimension (clamped so they stay sensible at
  // extreme sizes), so bigger screens convert more bubbles across a wider
  // area, proportionally.
  function unstableRadius() {
    return Math.min(260, Math.max(90, Math.min(pfW, pfH) * CONFIG.unstableRadiusFraction));
  }
  function unstableMaxConvert() {
    const scaled = Math.round(Math.min(pfW, pfH) / CONFIG.unstableConvertDivisor);
    return Math.min(CONFIG.unstableConvertMax, Math.max(CONFIG.unstableConvertMin, scaled));
  }

  // Converts the closest safe bubbles within radius into bombs — always the
  // nearest ones, never random, so the player can tell what happened.
  function convertNearbyToBombs(b) {
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const radius = unstableRadius();
    const maxConvert = unstableMaxConvert();
    const candidates = bubbles
      .filter((o) => o !== b && !o.dead && !o.isBomb && !o.isUnstable && !o.isNeutral)
      .map((o) => ({ o, dist: Math.hypot((o.x + o.size / 2) - cx, (o.y + o.size / 2) - cy) }))
      .filter((e) => e.dist <= radius)
      .sort((a, c) => a.dist - c.dist)
      .slice(0, maxConvert);
    for (const { o } of candidates) convertToBomb(o);
  }

  function convertToBomb(b) {
    b.isBomb = true;
    b.el.classList.remove("c2", "c4");
    b.el.classList.add("bomb");
    const icon = document.createElement("div");
    icon.className = "bomb-icon";
    icon.innerHTML = BOMB_ICON_SVG;
    b.el.appendChild(icon);
  }

  function triggerUnstable(b) {
    convertNearbyToBombs(b);
    popNormal(b, CONFIG.unstableValueMul);
  }

  function triggerBomb(b) {
    state.gameOver = true;
    b.el.classList.add("bomb-revealed");
    ensureAudio();
    setTimeout(() => {
      b.el.classList.add("exploding");
      playBoom();
      screenFlash();
    }, 160);
    stopLoop();
    setTimeout(showGameOver, 620);
  }

  function handleTap(b) {
    if (state.paused || state.gameOver || b.dead) return;
    if (b.isBomb) triggerBomb(b);
    else if (b.isNeutral) revealNeutral(b);
    else if (b.isUnstable) triggerUnstable(b);
    else popNormal(b, CONFIG.safeValueMul);
  }

  // ---------- loop ----------
  function step(now) {
    rafId = requestAnimationFrame(step);
    if (lastT === null) lastT = now;
    const dt = Math.min(48, now - lastT);
    lastT = now;
    if (state.paused || state.gameOver) return;

    measurePlayfield();

    topUpAcc += dt;
    if (topUpAcc > 1800) {
      topUpAcc = 0;
      topUpBubbles();
    }

    for (const b of bubbles) {
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const maxX = Math.max(0, pfW - b.size);
      const maxY = Math.max(0, pfH - b.size);
      if (b.x < 0) { b.x = 0; b.vx *= -1; }
      else if (b.x > maxX) { b.x = maxX; b.vx *= -1; }
      if (b.y < 0) { b.y = 0; b.vy *= -1; }
      else if (b.y > maxY) { b.y = maxY; b.vy *= -1; }
      applyTransform(b);

      if (b.isBomb) b.age += dt;
    }
  }

  function startLoop() {
    lastT = null;
    rafId = requestAnimationFrame(step);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---------- pointer handling ----------
  playfield.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".bubble");
    if (!el) return;
    const id = Number(el.dataset.id);
    const b = bubbles.find((x) => x.id === id);
    if (b) handleTap(b);
  });

  // ---------- pause ----------
  function setPaused(p) {
    state.paused = p;
    pauseOverlay.classList.toggle("hidden", !p);
    pauseIcon.style.display = p ? "none" : "";
    playIcon.style.display = p ? "" : "none";
    playfield.style.pointerEvents = p ? "none" : "";
  }
  pauseBtn.addEventListener("click", () => {
    if (state.gameOver) return;
    setPaused(!state.paused);
  });
  resumeBtn.addEventListener("click", () => setPaused(false));

  // ---------- game over / restart ----------
  function showGameOver() {
    finalScoreEl.textContent = pad(state.score, 5);
    const best = Math.max(state.score, Number(localStorage.getItem("twb_best") || 0));
    localStorage.setItem("twb_best", String(best));
    bestScoreEl.textContent = "BEST " + pad(best, 5);
    gameOverOverlay.classList.remove("hidden");

    renderGlobalBest(globalScoreEl, {
      slug: "bubble-tap",
      score: state.score,
      // Highest wins here. A zero-tap run is not a record even against an
      // empty board.
      isRecord: (score, best) => score > 0 && score >= best,
      label: (best) => "GLOBAL BEST " + pad(best, 5),
      recordLabel: "★ NEW GLOBAL HIGH SCORE ★",
      pending: "GLOBAL BEST …",
      unavailable: "GLOBAL BEST UNAVAILABLE",
    });
  }

  function resetGame() {
    stopLoop();
    for (const b of bubbles) if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
    bubbles = [];
    state.score = 0;
    state.taps = 0;
    state.paused = false;
    state.gameOver = false;
    state.combo = 0;
    state.lastPopAt = 0;
    topUpAcc = 0;
    updateStats();
    setPaused(false);
    gameOverOverlay.classList.add("hidden");
    measurePlayfield();
    topUpBubbles();
    spawnInitialBombs();
    startLoop();
  }

  restartBtn.addEventListener("click", resetGame);
  restartFromSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
    resetGame();
  });

  // ---------- share ----------
  function shareUrl(score) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("score", String(score));
    return url.toString();
  }

  async function handleShare() {
    const score = state.score;
    const url = shareUrl(score);
    const text = `I scored ${score} popping bubbles in Tap When Bored — dodge the hidden bombs and beat me:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Tap When Bored", text, url });
      } catch (e) {
        // user cancelled the share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      const original = shareBtn.textContent;
      shareBtn.textContent = "LINK COPIED";
      setTimeout(() => {
        shareBtn.textContent = original;
      }, 1600);
    } catch (e) {
      // clipboard unavailable — nothing more we can do silently
    }
  }
  shareBtn.addEventListener("click", handleShare);

  // ---------- challenge banner ----------
  function checkChallengeLink() {
    const params = new URLSearchParams(location.search);
    const raw = params.get("score");
    const challengeScore = Number(raw);
    if (!raw || !Number.isFinite(challengeScore) || challengeScore <= 0) return;
    challengeBanner.textContent = `A FRIEND SCORED ${pad(Math.round(challengeScore), 5)} — TAP TO DISMISS AND BEAT IT`;
    challengeBanner.classList.remove("hidden");
    challengeBanner.addEventListener("click", () => {
      challengeBanner.classList.add("hidden");
    });
  }

  // ---------- settings ----------
  function syncToggle(el, on) {
    el.classList.toggle("on", on);
  }
  function openSettings() {
    settingsPanel.classList.remove("hidden");
    syncToggle(soundToggle, state.soundOn);
    syncToggle(motionToggle, state.calmMode);
  }
  // ---------- how to play ----------
  const openHowto = () => {
    howtoSheet.classList.add("show");
    howtoBackdrop.classList.add("show");
  };

  const closeHowto = () => {
    howtoSheet.classList.remove("show");
    howtoBackdrop.classList.remove("show");
  };

  howtoBtn.addEventListener("click", openHowto);
  howtoBackdrop.addEventListener("click", closeHowto);

  settingsBtn.addEventListener("click", openSettings);
  closeSettingsBtn.addEventListener("click", () => settingsPanel.classList.add("hidden"));
  soundToggle.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    localStorage.setItem("twb_sound", String(state.soundOn));
    syncToggle(soundToggle, state.soundOn);
    if (state.soundOn) { ensureAudio(); playPop(); }
  });
  motionToggle.addEventListener("click", () => {
    state.calmMode = !state.calmMode;
    localStorage.setItem("twb_calm", String(state.calmMode));
    syncToggle(motionToggle, state.calmMode);
    const mul = state.calmMode ? 0.35 : 1;
    for (const b of bubbles) {
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > 0) {
        const norm = 1 / speed;
        const base = rand(...CONFIG.speedRange) * mul;
        b.vx = b.vx * norm * base;
        b.vy = b.vy * norm * base;
      }
    }
  });

  // ---------- resize ----------
  window.addEventListener("resize", () => {
    measurePlayfield();
    topUpBubbles();
  });

  // ---------- boot ----------
  measurePlayfield();
  updateStats();
  checkChallengeLink();
  topUpBubbles();
  spawnInitialBombs();
  startLoop();
})();
