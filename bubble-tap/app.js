(() => {
  "use strict";

  // ---------- global high score (Supabase) ----------
  // Real values live in config.js, which is gitignored and never committed.
  // See config.example.js for the template and README-supabase.sql for setup.
  const SUPABASE_URL = (window.TWB_CONFIG && window.TWB_CONFIG.SUPABASE_URL) || "";
  const SUPABASE_ANON_KEY = (window.TWB_CONFIG && window.TWB_CONFIG.SUPABASE_ANON_KEY) || "";

  function supabaseConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  // Calls the submit_score(new_score) RPC, which atomically raises the
  // single shared row only if this score beats it, and always returns the
  // current global best. Returns null if unconfigured or the request fails.
  async function submitGlobalScore(score) {
    if (!supabaseConfigured()) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ new_score: score }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data === "number" ? data : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- config ----------
  const CONFIG = {
    minSize: 42,
    maxSize: 104,
    baseValue: 10,
    valueIncrement: 10,
    bombThresholdRange: [5, 6],
    speedRange: [0.022, 0.06],
    // bubble count is never a fixed number — it's derived from screen area
    // (bigger screen = more room = more bubbles) and grows as you play, up to
    // maxDensityMultiplier. That cap exists only so bubbles stay big enough to
    // tap accurately and phones don't choke — not an arbitrary "15".
    areaPerBubble: 9000,
    densityGrowthPerTap: 0.006,
    maxDensityMultiplier: 3.2,
    bonusChance: 0.1,
    comboWindowMs: 900,
    maxCombo: 12,
    // subtle bomb "tells" — a faint grey tint (CSS) plus a slower, faintly
    // wobbly drift. Learnable with attention, easy to miss once the field
    // gets crowded and fast in later waves.
    bombSpeedMul: 0.6,
    bombWobbleAmp: 1.6,
  };

  // ---------- dom ----------
  const playfield = document.getElementById("playfield");
  const scoreEl = document.getElementById("scoreVal");
  const tapsEl = document.getElementById("tapsVal");
  const bombsEl = document.getElementById("bombsVal");
  const noticeEl = document.getElementById("notice");
  const challengeBanner = document.getElementById("challengeBanner");

  const pauseBtn = document.getElementById("pauseBtn");
  const pauseIcon = document.getElementById("pauseIcon");
  const playIcon = document.getElementById("playIcon");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");

  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const bestScoreEl = document.getElementById("bestScore");
  const globalScoreEl = document.getElementById("globalScore");
  const restartBtn = document.getElementById("restartBtn");
  const shareBtn = document.getElementById("shareBtn");
  const restartFromSettingsBtn = document.getElementById("restartFromSettingsBtn");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const soundToggle = document.getElementById("soundToggle");
  const motionToggle = document.getElementById("motionToggle");

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
    bombsSkipped: 0,
    bubbleValue: CONFIG.baseValue,
    tapsSinceBomb: 0,
    bombThreshold: randInt(...CONFIG.bombThresholdRange),
    bombRound: 0,
    paused: false,
    gameOver: false,
    soundOn: loadFlag("twb_sound", true),
    calmMode: loadFlag("twb_calm", false),
    combo: 0,
    lastPopAt: 0,
    bonusActive: false,
  };

  let bubbles = [];
  let idSeq = 0;
  let pfW = 0, pfH = 0;
  let lastT = null;
  let rafId = null;
  let noticeRevertTimer = null;
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
  function playDefuse() {
    if (!state.soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(640, t + 0.18);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.22);
  }

  // ---------- notice ----------
  function baseNoticeText() {
    const liveBombs = bubbles.filter((b) => b.isBomb && !b.dead).length;
    const remaining = Math.max(1, state.bombThreshold - state.tapsSinceBomb);
    if (liveBombs > 0) {
      return `${liveBombs} BOMB${liveBombs === 1 ? "" : "S"} HIDDEN — ${remaining} MORE TAP${remaining === 1 ? "" : "S"} TO CLEAR THEM`;
    }
    const nextCount = bombCountForRound(state.bombRound + 1);
    const bombWord = nextCount === 1 ? "A BOMB" : `${nextCount} BOMBS`;
    return `${bombWord} APPEAR${nextCount === 1 ? "S" : ""} AFTER ${remaining} MORE TAP${remaining === 1 ? "" : "S"}`;
  }
  function refreshNotice() {
    noticeEl.textContent = baseNoticeText();
    noticeEl.classList.toggle("warn", bubbles.some((b) => b.isBomb && !b.dead));
    noticeEl.classList.remove("good");
  }
  function flashNotice(text, cls, holdMs) {
    clearTimeout(noticeRevertTimer);
    noticeEl.textContent = text;
    noticeEl.classList.remove("warn", "good");
    if (cls) noticeEl.classList.add(cls);
    noticeRevertTimer = setTimeout(refreshNotice, holdMs);
  }

  // ---------- stats ----------
  function updateStats() {
    scoreEl.textContent = pad(state.score, 5);
    tapsEl.textContent = pad(state.taps, 2);
    bombsEl.textContent = pad(state.bombsSkipped, 2);
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
    const kind = !state.bonusActive && Math.random() < CONFIG.bonusChance ? "bonus" : "normal";
    return createBubble(kind);
  }

  const BOMB_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="42%" height="42%"><circle cx="11" cy="14" r="7" fill="currentColor"/>' +
    '<path d="M11 7 L13.2 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
    '<circle cx="13.6" cy="2.6" r="1.5" fill="currentColor"/></svg>';

  function createBubble(kind) {
    const isBomb = kind === "bomb";
    const isBonus = kind === "bonus";
    // bombs are sized exactly like normal bubbles — no free tell there.
    // The only tells are a faint grey tint (CSS) and a slower, faintly
    // wobbly drift, both subtle enough to require real attention.
    const size = isBonus ? rand(CONFIG.maxSize - 8, CONFIG.maxSize + 18) : rand(CONFIG.minSize, CONFIG.maxSize);
    const pos = pickSpawnPos(size);
    const calmMul = state.calmMode ? 0.35 : 1;
    const progressMul = 1 + Math.min(1, state.taps / 500) * 0.2;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(...CONFIG.speedRange) * calmMul * progressMul * (isBomb ? CONFIG.bombSpeedMul : 1);

    const el = document.createElement("div");
    el.className = "bubble spawning" + (isBomb ? " bomb" : "") + (isBonus ? " bonus" : "");
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
      isBonus,
      age: 0,
      wobblePhase: rand(0, Math.PI * 2),
      dead: false,
    };
    if (isBonus) state.bonusActive = true;
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
  function valueForBubble(b) {
    const variance = 0.85 + Math.random() * 0.3;
    let v = state.bubbleValue * variance;
    if (b.isBonus) v *= 3;
    return Math.max(5, Math.round(v / 5) * 5);
  }

  function popNormal(b) {
    b.dead = true;
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const base = valueForBubble(b);

    const now = Date.now();
    state.combo = now - state.lastPopAt < CONFIG.comboWindowMs ? Math.min(state.combo + 1, CONFIG.maxCombo) : 1;
    state.lastPopAt = now;
    const comboMul = 1 + (state.combo - 1) * 0.05;
    const gained = Math.round(base * comboMul);

    state.taps++;
    state.score += gained;
    state.tapsSinceBomb++;
    if (b.isBonus) state.bonusActive = false;

    const label = state.combo >= 3 ? `+${gained} ×${state.combo}` : `+${gained}`;
    showFloatText(cx, cy, label);
    showBurstRing(cx, cy, b.size);
    b.el.classList.add("popping");
    ensureAudio();
    playPop(state.combo);
    bubbles = bubbles.filter((x) => x !== b);
    removeBubbleEl(b, 300);
    updateStats();
    refreshNotice();
    setTimeout(topUpBubbles, 220);
    maybeArmBomb();
  }

  // Bomb count is a share of whatever's on screen, not a fixed number — a
  // phone with 20 bubbles and a desktop with 80 should feel equally
  // dangerous. Starts at 5% of the bubble count and climbs 3 points per wave
  // up to a 70% ceiling, rounded to the nearest bubble.
  function bombCountForRound(round) {
    const pct = Math.min(70, 5 + (round - 1) * 3);
    return Math.max(1, Math.round((pct / 100) * targetBubbleCount()));
  }

  // A bomb wave has no timer of its own — it just stays hidden among the
  // bubbles for the whole stretch until the next threshold is hit. That's
  // the moment the old wave gets swept (each one still counts as a skip)
  // and the next, bigger wave immediately takes its place.
  function sweepBombWave() {
    const liveBombs = bubbles.filter((b) => b.isBomb && !b.dead);
    if (!liveBombs.length) return;
    for (const b of liveBombs) {
      b.dead = true;
      b.el.classList.add("defusing");
      removeBubbleEl(b, 520);
    }
    bubbles = bubbles.filter((b) => !liveBombs.includes(b));
    state.bombsSkipped += liveBombs.length;
    state.bubbleValue += CONFIG.valueIncrement * liveBombs.length;
    ensureAudio();
    playDefuse();
    updateStats();
    flashNotice(
      `DODGED ${liveBombs.length} BOMB${liveBombs.length === 1 ? "" : "S"} — BUBBLES NOW WORTH ${state.bubbleValue}`,
      "good",
      2200
    );
    setTimeout(topUpBubbles, 260);
  }

  function maybeArmBomb() {
    if (state.tapsSinceBomb < state.bombThreshold) return;
    sweepBombWave();
    state.bombRound++;
    const count = bombCountForRound(state.bombRound);
    for (let i = 0; i < count; i++) createBubble("bomb");
    state.tapsSinceBomb = 0;
    state.bombThreshold = randInt(...CONFIG.bombThresholdRange);
    refreshNotice();
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
    else popNormal(b);
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

    if (!supabaseConfigured()) {
      globalScoreEl.classList.add("hidden");
      return;
    }
    globalScoreEl.classList.remove("hidden");
    globalScoreEl.classList.remove("new-global");
    globalScoreEl.textContent = "GLOBAL BEST …";
    submitGlobalScore(state.score).then((globalBest) => {
      if (globalBest === null) {
        globalScoreEl.textContent = "GLOBAL BEST UNAVAILABLE";
        return;
      }
      const isNewGlobal = state.score > 0 && state.score >= globalBest;
      globalScoreEl.textContent = isNewGlobal ? "★ NEW GLOBAL HIGH SCORE ★" : "GLOBAL BEST " + pad(globalBest, 5);
      globalScoreEl.classList.toggle("new-global", isNewGlobal);
    });
  }

  function resetGame() {
    stopLoop();
    clearTimeout(noticeRevertTimer);
    for (const b of bubbles) if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
    bubbles = [];
    state.score = 0;
    state.taps = 0;
    state.bombsSkipped = 0;
    state.bubbleValue = CONFIG.baseValue;
    state.tapsSinceBomb = 0;
    state.bombThreshold = randInt(...CONFIG.bombThresholdRange);
    state.bombRound = 0;
    state.paused = false;
    state.gameOver = false;
    state.combo = 0;
    state.lastPopAt = 0;
    state.bonusActive = false;
    topUpAcc = 0;
    updateStats();
    refreshNotice();
    setPaused(false);
    gameOverOverlay.classList.add("hidden");
    measurePlayfield();
    topUpBubbles();
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
  refreshNotice();
  checkChallengeLink();
  topUpBubbles();
  startLoop();
})();
