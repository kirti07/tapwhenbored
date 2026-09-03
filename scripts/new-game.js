// npm run game:new <slug>
//
// Creates src/<slug>/ from the shared page template and adds the registry entry,
// which is the whole of "adding a game" (ARCHITECTURE.md §11). Deliberately a
// small script and not a scaffolding framework (§33).
//
// It writes placeholder copy on purpose: `npm run validate` will pass, so you
// can play the empty game immediately, but the text is obviously unfinished so
// it cannot be mistaken for done.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(rootDir, "src");
const registryPath = path.join(srcDir, "data", "games.js");

const RESERVED = new Set([
  "assets",
  "static",
  "icons",
  "data",
  "shared",
  "api",
  "_vercel",
]);

const slug = process.argv[2];
const die = (msg) => {
  console.error(`game:new: ${msg}`);
  process.exit(1);
};

if (!slug) die("usage: npm run game:new <slug>");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
  die(`"${slug}" must be lowercase kebab-case, e.g. "tile-flip"`);
if (RESERVED.has(slug)) die(`"${slug}" is reserved and would collide with a build path`);

const gameDir = path.join(srcDir, slug);
if (existsSync(gameDir)) die(`src/${slug}/ already exists`);

const registry = readFileSync(registryPath, "utf8");
if (registry.includes(`slug: "${slug}"`)) die(`"${slug}" is already in the registry`);

// Title Case from the slug: "tile-flip" -> "Tile Flip".
const title = slug
  .split("-")
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(" ");
const today = new Date().toISOString().slice(0, 10);

// The shared page shell, matching the six template-conforming games. The
// theme-bootstrap marker sits immediately after the theme-color meta because
// the snippet queries that tag (§18).
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6f6fb">
<!-- theme-bootstrap -->
<title>${title} — Free Online Game</title>
<meta name="description" content="TODO: one sentence on what the player does. No signup, no download.">
<link rel="canonical" href="https://www.tapwhenbored.com/${slug}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${title} — Free Online Game">
<meta property="og:description" content="TODO: one sentence on what the player does.">
<meta property="og:url" content="https://www.tapwhenbored.com/${slug}/">
<meta property="og:image" content="https://www.tapwhenbored.com/assets/${slug}-og.jpg">
<meta property="og:image:width" content="640">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title} — Free Online Game">
<meta name="twitter:description" content="TODO: one sentence on what the player does.">
<meta name="twitter:image" content="https://www.tapwhenbored.com/assets/${slug}-og.jpg">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Game",
  "name": "${title}",
  "url": "https://www.tapwhenbored.com/${slug}/",
  "description": "TODO: one sentence on what the player does.",
  "image": "https://www.tapwhenbored.com/assets/${slug}-og.jpg",
  "genre": "Puzzle",
  "playMode": "SinglePlayer",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Tap When Bored", "item": "https://www.tapwhenbored.com/" },
    { "@type": "ListItem", "position": 2, "name": "${title}", "item": "https://www.tapwhenbored.com/${slug}/" }
  ]
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="stage">
    <header class="topbar">
      <div class="brand">
        <a class="back-link" href="/">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          <span>Games</span>
        </a>
        <h1 class="title">${title.toUpperCase()}</h1>
        <p class="subtitle">PUZZLE</p>
      </div>
      <div class="top-actions">
        <button class="icon-btn" id="restartBtn" title="Restart" aria-label="Restart">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.9-6.16"/><path d="M20 4v5h-5"/></svg>
        </button>
      </div>
    </header>

    <p class="tagline">TODO: tell the player what to do, in one line.</p>

    <div class="board-area">
      <div id="board"></div>
    </div>

    <button class="howto-link" id="howtoBtn">How to play</button>

    <details class="seo-info">
      <summary>What is this?</summary>
      <p>TODO: two or three sentences for search engines and curious players.</p>
    </details>
  </div>

  <div class="howto-backdrop" id="howtoBackdrop"></div>
  <div class="howto-sheet" id="howtoSheet">
    <div class="howto-handle"></div>
    <p class="howto-title">How to play</p>
    <ul class="howto-list">
      <li>TODO: the one action the player takes.</li>
      <li>TODO: what makes a move good or bad.</li>
      <li>TODO: how the game ends.</li>
    </ul>
  </div>

  <div class="overlay" id="overlay">
    <div class="overlay-content">
      <p class="overlay-title" id="overlayTitle">SOLVED</p>
      <p class="overlay-sub" id="overlaySub"></p>
      <!-- Giving this game a leaderboard? Add a paragraph here with the
           class overlay-global, the id globalBest and the hidden attribute,
           then @import shared/css/leaderboard.css, call renderGlobalBest()
           from the end-of-run handler, and add the game to the game_config
           seed in README-supabase.sql. See ARCHITECTURE.md §27. Validation
           requires that line and the registry entry to agree, so add both or
           neither. (Spelled out rather than shown, because validation greps
           this file for the literal id.) -->
      <div class="overlay-actions">
        <button class="again-btn" id="againBtn">Again</button>
        <button class="share-btn" id="shareBtn">Share</button>
      </div>
      <p class="share-note" id="shareNote">Link copied</p>
    </div>
  </div>

  <script type="module" src="./game.js"></script>
</body>
</html>
`;

const css = `/* Shared first: game rules below must be able to override them, and
   @import inlines in source order in both dev and build. */
@import "../shared/css/tokens.css";
@import "../shared/css/base.css";
@import "../shared/css/shell.css";
@import "../shared/css/howto.css";

/* This game's own palette. The token names are shared; the values are this
   game's identity, so they belong here and never in shared CSS. */
:root {
  --bg: #f6f6fb;
  --ink: #262b3d;
  --ink-soft: #6b7089;
  --line: #d8dae6;
  --accent: #8b7fe0;
  --accent-dark: #6f62c8;
}

[data-theme="dark"] {
  --bg: #0d0e1a;
  --ink: #e8e8f0;
  --ink-soft: #9296ad;
  --line: #2a2d42;
}

html, body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, "Segoe UI", sans-serif;
}

.stage {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: 2vh 4vw;
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(16px, 2.6vh, 21px);
  letter-spacing: 0.02em;
}

.tagline {
  flex-shrink: 0;
  margin: 1.2vh 0;
  color: var(--ink-soft);
  font-size: clamp(11px, 1.6vh, 13px);
  text-align: center;
}

.board-area {
  flex: 1;
  display: grid;
  place-items: center;
}

.icon-btn:active { background: rgba(139, 127, 224, 0.12); }

.overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.overlay.show { opacity: 1; pointer-events: auto; }
`;

const js = `// ${title}
//
// Input -> state -> rules -> render. Keep the state explicit and in one place
// rather than spread across DOM attributes and CSS classes
// (ARCHITECTURE.md §13).

(function () {
  "use strict";

  var boardEl = document.getElementById("board");
  var overlayEl = document.getElementById("overlay");
  var restartBtn = document.getElementById("restartBtn");
  var againBtn = document.getElementById("againBtn");
  var howtoBtn = document.getElementById("howtoBtn");
  var howtoSheet = document.getElementById("howtoSheet");
  var howtoBackdrop = document.getElementById("howtoBackdrop");

  var state = null;

  function newState() {
    return { moves: 0, solved: false };
  }

  function render() {
    // TODO: draw the board from \`state\`.
    boardEl.textContent = "TODO: build " + ${JSON.stringify(title)};
  }

  function showOverlay() {
    overlayEl.classList.add("show");
  }

  function hideOverlay() {
    overlayEl.classList.remove("show");
  }

  // A restart must produce a clean state without a page reload (§14).
  function start() {
    state = newState();
    hideOverlay();
    render();
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

  howtoBtn.addEventListener("click", openHowto);
  howtoBackdrop.addEventListener("click", closeHowto);

  restartBtn.addEventListener("click", start);
  againBtn.addEventListener("click", start);

  start();
})();
`;

mkdirSync(gameDir, { recursive: true });
writeFileSync(path.join(gameDir, "index.html"), html);
writeFileSync(path.join(gameDir, "style.css"), css);
writeFileSync(path.join(gameDir, "game.js"), js);

// Append the registry entry just before the closing bracket of `games`.
const entry = `  {
    slug: ${JSON.stringify(slug)},
    title: ${JSON.stringify(title)},
    tagline: "TODO · TODO",
    description:
      "TODO: one sentence for search results, ending in no signup.",
    path: ${JSON.stringify(`/${slug}/`)},
    thumb: ${JSON.stringify(`/assets/${slug}-thumb.svg`)},
    thumbAlt: ${JSON.stringify(`${title} — preview`)},
    ogImage: ${JSON.stringify(`/assets/${slug}-og.jpg`)},
    cardClass: ${JSON.stringify(`card--${slug}`)},
    category: "Puzzle",
    darkThemeColor: "#0d0e1a",
    updated: ${JSON.stringify(today)},
    changefreq: "monthly",
    hasRestart: true,
    hasOverlay: true,
    // A descriptor ({ lowerIsBetter, daily, unit }) opts this game into the
    // global-best line; see ARCHITECTURE.md §27 for what else that needs.
    leaderboard: false,
  },
`;

const marker = "\n];\n";
const at = registry.lastIndexOf(marker);
if (at === -1) die("could not find the end of the games array in src/data/games.js");
writeFileSync(
  registryPath,
  registry.slice(0, at + 1) + entry + registry.slice(at + 1),
);

console.log(`Created src/${slug}/ and added the registry entry.

Still to do:
  1. public/assets/${slug}-thumb.svg   homepage card art (640x640)
  2. public/assets/${slug}-og.jpg      social preview, raster not SVG (640x640)
  3. Replace every TODO in src/${slug}/ and in the registry entry
  4. Add .card--${slug} { --accent: ...; } to src/style.css
  5. Replace the three TODO bullets in the "How to play" sheet
  6. Build the mechanic in src/${slug}/game.js
  7. tests/games/${slug}.spec.js once the mechanic works

  npm run validate    checks the wiring
  npm run dev         then open http://localhost:5173/${slug}/
`);
