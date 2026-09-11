# Tap When Bored — Current State (for UI design)

Snapshot of the codebase at `main @ 90bf561`, written for designers who have
never seen this repo. Read-only research; nothing under `src/`, `tests/`,
`scripts/` or `public/` was touched to produce this.

---

## 1. Product summary

"Tap When Bored" (tapwhenbored.com) is a small **multi-page** collection of
free, single-player, no-signup browser games. One homepage lists a shelf of
game cards; each game is its own standalone page (`/slug/`) with its own
JS/CSS, no shared game engine. The pitch, everywhere, is "Open. Understand.
Play." — instant, no download, no account.

The 8 games, from `src/data/games.js` (array order = homepage shelf order):

| Slug | Title | Tagline | One-line description | Leaderboard |
|---|---|---|---|---|
| `marble-nostalgia` | Marble Nostalgia | Think · Move | Classic peg-solitaire board; jump marbles to capture, finish with one. | lowerIsBetter, not daily, unit "marbles left" |
| `bubble-tap` | Bubble Tap | Tap · Relax | Pop endless virtual bubble wrap. | higherIsBetter (lowerIsBetter:false), not daily, unit "points" |
| `slide-n-order` | Slide N Order | Tap · Arrange | Classic 15-puzzle, slide tiles into order, no timer. | lowerIsBetter, not daily, unit "moves" |
| `flip-it` | Flip It | Tap · Clear | Lights-Out puzzle: tap flips a tile + its 4 neighbours; 3 difficulty levels. | lowerIsBetter, not daily, unit "perfect time" (only counts when the run matches the board's computed optimal, Medium level only) |
| `word-steps` | Word Steps | Think · Spell | Daily word-ladder puzzle, change one letter at a time. | lowerIsBetter, **daily**, unit "steps" |
| `untangle` | Untangle | Drag · Solve | Drag dots until no lines cross; new random puzzle each time. | **no leaderboard** (puzzle size/difficulty varies too much to compare runs) |
| `honeycomb` | Honeycomb | Tap · Reshape | Move edge hex tiles to reshape a hive while keeping it connected; new random hive each time. | lowerIsBetter, not daily, unit "time" (completion ms) |
| `doodle-on` | Doodle On | Draw · 30s | Random shape + random idea, turn one into the other in 30s; draw/fill/share. | **no leaderboard** (no score by design — the result is the picture) |

Note the registry also carries per-game build/behaviour flags designers should
know exist even though they aren't visual: `hasRestart` (topbar "new
puzzle/board" icon button present), `hasOverlay` (uses the shared end-card
overlay template — only `bubble-tap` is `false`, it predates the template and
shows game-over inline instead), `darkThemeColor` (per-game dark
`theme-color` meta, must match that game's dark `--bg`), and `cardClass`
(homepage card accent hook, see §2).

---

## 2. Homepage anatomy (`src/index.html` + `src/style.css`)

Single page, `.hub` container (max-width 960px, centred, padded).

**Header** (`.hub-header`, flex row, wraps):
- `.brand`: `<h1 class="brand-name">` = "Tap **When** **Bored**" where "When"
  and "Bored" are separately-coloured `<span class="brand-pop brand-pop--warm">`
  / `brand-pop--cool` (warm = `#ff6f5e` light / `#ff5c8a` dark; cool =
  `#1f9974` light / `#34e19a` dark). `<p class="tagline">Tiny games. Big
  breaks.</p>`.
- `.theme-toggle`: sun/moon SVG icons flanking a pill switch
  (`#themeSwitch`, `role="switch"`, `aria-checked`) — see theming below.

**Intro copy**: below the shelf (not above it), `<p class="intro">` — one
paragraph describing the shelf in prose, naming several games by name.

**Card grid** (`<main class="shelf">`): CSS grid,
`repeat(auto-fit, minmax(180px,1fr))`, 2 columns forced under 480px. Cards are
built at **build time** by a Vite plugin (`vite.config.js` `homepageFromRegistry()`)
from `games.js`, not hand-authored HTML. Per-card markup:
```html
<a class="card card--flip-it" href="/flip-it/">
  <img class="thumb" src="/assets/flip-it-thumb.svg" width="640" height="640"
       decoding="async" [fetchpriority="high" | loading="lazy"] alt="...">
  <div class="card-body">
    <div class="card-text">
      <h2 class="card-name">Flip It</h2>
      <p class="card-desc">Tap · Clear</p>  <!-- this is the TAGLINE, not the long description -->
    </div>
    <span class="play-btn" aria-hidden="true"><svg>…triangle…</svg></span>
  </div>
</a>
```
Only the first 4 cards (`EAGER_CARDS`) load eagerly; card 1 gets
`fetchpriority="high"` (LCP candidate); the rest `loading="lazy"`. Thumb is a
square (640×640) image, `object-fit: cover`, rounded 11px corners, sits in a
cream/white "photo-in-a-mat" card (18px radius) on a warm/kraft-paper (light)
or near-black (dark) backdrop. `.play-btn` is a small filled accent-colour
circle with a play triangle, bottom-right of the card body.

**Per-card accent colors** (`--accent`, set via `.card--<slug>` classes,
light → dark):
| Card class | Light accent | Dark accent |
|---|---|---|
| `.card--marble` | `#1684d1` | `#22d3ee` |
| `.card--bubble` | `#4fb6e0` | `#22e5ff` |
| `.card--slide` | `#8b7fe0` | `#a855f7` |
| `.card--doodle` | `#7c5cff` | `#ff5fb3` |
| `.card--word` | `#1f9974` | `#34e19a` |
| `.card--untangle` | `#ef6a55` | `#ff6b57` |
| `.card--honeycomb` | `#8b6fd9` | `#b48cff` |
| `.card--flip-it` | `#f0a825` | `#ffd60a` |

Accent drives: hover border/shadow tint, hover `.card-desc` colour, and the
`.play-btn` fill. In dark mode cards also get a neon outline+glow
(`box-shadow` using `color-mix(... var(--accent) ...)`), and thumbnails are
re-toned with `filter: brightness(0.82) contrast(1.12) saturate(1.3)` rather
than shipping second dark-mode art.

**FAQ**: `<section class="faq">` — 3 native `<details>`/`<summary>`
accordion items ("Are the games free?" / "Do I need to sign up…" / "Do the
games work on mobile?"), custom `+`/`–` marker via `::before`, matches the
`FAQPage` JSON-LD in `<head>`.

**Footer**: `<footer class="hub-footer">More tiny games coming soon.</footer>`
— one centred line, no links, no social, no legal.

**Theme handling**: a `<meta name="theme-color">` plus an inline
`<!-- theme-bootstrap -->` script (injected identically into every page by
`scripts/theme-bootstrap.js` via a Vite plugin) reads `localStorage["theme"]`
(falling back to `matchMedia('(prefers-color-scheme: dark)')`) and sets
`data-theme="dark"|"light"` on `<html>` **before first paint**, to avoid a
flash. The visible toggle is a pill switch (`#themeSwitch`,
`role="switch"`), driven purely by the `data-theme` attribute (not by
`aria-checked`, so a reload never shows the knob in the wrong position before
JS runs). Clicking it flips `data-theme`, updates `<meta name="theme-color">`
to the game/page's `darkThemeColor`, and persists to `localStorage.theme`.
There is **no in-game theme toggle** (see U9) — a player who lands on a game
page via a shared link cannot change theme without going back to the
homepage.

**Install/PWA affordance**: none visible. There's a `<link rel="manifest"
href="/manifest.webmanifest">` (name "Tap When Bored", `display: standalone`,
icons 192/512/maskable-512, `background_color`/`theme_color` `#f6f6fb`) so
browsers may offer their own native "Install app" UI, but the site has no
custom "Add to Home Screen" button, no `beforeinstallprompt` handling, and
(per the most recent commit, #22) **no service worker / no offline caching**
— it's installable as a shortcut only, not an offline app.

---

## 3. Game page shell anatomy

Shared CSS a template-conforming game imports, in source order (imports
cascade, so a game's own `:root` after them overrides token *values*, never
names): `tokens.css` → `base.css` → `shell.css` → `howto.css` →
`leaderboard.css` (only if it has a leaderboard). Only 6 of 8 games use the
full shell; **Bubble Tap** uses none of `shell.css`/`howto.css` (its own
topbar + no howto sheet) and **Untangle**/**Honeycomb** have `hasRestart:
false` so their topbar has no reset icon. Representative game below is
**Flip It** (`src/flip-it/`), cross-checked against **Untangle**.

### Topbar (`shell.css` + game's own `style.css`)

```html
<header class="topbar">
  <div class="brand">
    <a class="back-link" href="/"><svg>‹</svg><span>Games</span></a>
    <h1 class="title">FLIP IT</h1>
    <p class="subtitle">PUZZLE</p>
  </div>
  <div class="top-actions">
    <button class="icon-btn" id="resetBtn" title="Reset board" aria-label="Reset board">↺</button>
    <button class="icon-btn" id="restartBtn" title="New puzzle" aria-label="New puzzle">↻</button>
    <button class="icon-btn" id="soundBtn" title="Sound" aria-label="Sound on" aria-pressed="true">🔊/🔇</button>
  </div>
</header>
```
`.topbar` is `display:flex; justify-content:space-between`. Left side
(`.brand`) is a column: back-link ("‹ Games", `--ink-soft` colour) → game
title (`.title`, all-caps, `var(--font-display)`, per-game colour/size) →
`.subtitle` (small letter-spaced category word, e.g. "PUZZLE"). Right side
(`.top-actions`) is a row of 44×44px circular `.icon-btn`s
(`border-radius:50%`, 1.5px `--line` border, transparent bg). Flip It has
**3** icon buttons: Reset (restore this board's starting pattern), New
puzzle/board (deals a fresh board — this is `hasRestart`), Sound (two SVGs
swapped via `.is-off` class, `aria-pressed` toggled). Games without
`hasRestart` (Untangle, Honeycomb) drop the "new board" icon; games with no
sound implementation drop the sound icon entirely (only Flip It and Bubble
Tap have a sound toggle at all — see U1).

Below the topbar: a short 1–2 line `.tagline` describing the objective
(centred, `--ink-soft`), then the game stage.

### Stage

`.board-area` holds the board (`.board-wrap` / `.grid` / `#board`), a small
`.stats` row (labelled numbers — Flip It shows "Moves" and "Time"), and
secondary `.controls` (Flip It: 3 pill `.level-btn`s for Easy/Medium/Hard,
`is-active`/`aria-pressed` state). Below the stage, a centred
`.howto-link` button ("How to play"), and a collapsed `<details
class="seo-info">What is this?</details>` holding one paragraph of indexable
description text (closed by default, small font, `--ink-soft`).

### End-of-game overlay / end card

Exact DOM (Flip It; every templated game repeats this shape with small
variations — see §9 for the copy differences):
```html
<div class="overlay" id="overlay">
  <div class="overlay-content">
    <p class="overlay-title" id="overlayTitle">CLEARED!</p>
    <p class="overlay-badge" id="overlayBadge" hidden>PERFECT</p>
    <p class="overlay-sub" id="overlaySub"></p>
    <p class="overlay-time" id="overlayTime"></p>
    <p class="overlay-global" id="globalBest" hidden></p>
    <p class="overlay-hint" id="lbHint" hidden>Match the optimal on Medium to enter the global board.</p>
    <div class="overlay-actions">
      <button class="again-btn" id="againBtn">Play Again</button>
      <button class="share-btn" id="shareBtn">Share</button>
    </div>
    <p class="share-note" id="shareNote">Link copied</p>
  </div>
</div>
```
Behaviour: `.overlay` is `position:fixed; inset:0`, a translucent scrim of
the page's own `--bg` (95% opacity, *not* a neutral dark scrim), toggled
visible by adding `.show` (opacity 0→1, ~0.4s). It sits over the still-live
game board — **the overlay is not a true modal anywhere** (U3): the board,
level buttons and howto link stay clickable underneath, no focus is moved
into the card, no Escape handler.

What it shows, top to bottom: a big title (win/lose state, e.g. "CLEARED!"),
an optional pill badge for a special achievement (Flip It: "PERFECT" when
the run matched the computed optimal-move solution), a one-line stat summary
(moves/score), a secondary stat/context line (time, or "Best" comparison),
the **global-best line** (`.overlay-global`/`#globalBest`, hidden until the
leaderboard promise resolves — see §5), an optional hint line explaining why
this run didn't qualify for the leaderboard, then two pill buttons — **Play
Again** (primary, gradient-filled) and **Share** (secondary, outlined) — and
finally a `.share-note` line ("Link copied") that fades in after Share is
used and doesn't reset until the next overlay show.

**Share flow**: `navigator.share()` (native share sheet) if available,
composing a title/text ("I cleared FLIP IT on Medium (5×5) in 9 moves
(optimal 8). Can you beat that?") + a URL carrying the result as query params
(`?moves=9&level=medium`) so a friend who opens the link sees a "challenge
banner" comparing their run. Falls back to
`navigator.clipboard.writeText(text + " " + url)` + shows `.share-note`
("Link copied") when the Share Sheet API is unavailable (desktop Chrome/
Firefox). Doodle On's share differs — it shares a rendered PNG of the
drawing, not text — and its share-note says "Saved" (see §9).

**Howto sheet** (bottom sheet, shared `howto.css`):
```html
<div class="howto-backdrop" id="howtoBackdrop"></div>
<div class="howto-sheet" id="howtoSheet">
  <div class="howto-handle"></div>
  <p class="howto-title">How to play</p>
  <ul class="howto-list">
    <li>Tap any tile on the board.</li>
    <li>It flips itself and the four tiles <strong>above, below, left and right</strong> — never the diagonals.</li>
    <li>Turn <strong>every tile off</strong> to clear the board. Fewer moves is better.</li>
  </ul>
</div>
```
Full-viewport scrim backdrop + a sheet sliding up from the bottom
(`transform: translateY(100%→0)`, 0.35s cubic-bezier), rounded top corners
(20px), grab-handle bar, 2–4 bullet steps with a bold span for the key rule.
Bottom padding reserves `env(safe-area-inset-bottom)` — but this is dead
code everywhere except Bubble Tap and the homepage, because only they set
`viewport-fit=cover` in their `<meta name="viewport">` (U2), so on notched
phones the last bullet sits under the home indicator on every other game.

**Sound toggle**: only Flip It and Bubble Tap implement one (icon-btn with
`.is-off` swapping between two inline SVGs, persisted to
`localStorage["twb_sound"]` — this key is explicitly shared between the two
games as "one sound preference"). The other 6 games have no audio at all.

---

## 4. Design tokens

**`src/shared/css/tokens.css` is the entire cross-game token file, and it
only defines fonts — not color, radius, spacing, or shadow.** Its own
comment is explicit about why: "A game's palette is part of its identity and
lives in its own style.css. This file must never set --bg, --ink, --line,
--accent, or any other colour a game defines for itself: the token NAMES
agree across games but the VALUES deliberately differ." So there is no
central design-token system today — there's a **naming convention** (every
game defines its own `--bg`/`--ink`/`--ink-soft`/`--line`/`--accent`/
`--accent-dark`/`--scrim`, and shared CSS like `shell.css`/`howto.css`/
`leaderboard.css` consumes those names), each game supplying different
values, plus a light/dark override block (`:root[data-theme="dark"] { ... }`)
that redeclares the same names with different values.

`tokens.css` contents in full:
```css
@font-face {
  font-family: "Nunito"; font-weight: 700; font-display: swap;
  src: url("/fonts/nunito-latin-700.woff2") format("woff2"); /* latin subset */
}
@font-face {
  font-family: "Nunito"; font-weight: 800; font-display: swap;
  src: url("/fonts/nunito-latin-800.woff2") format("woff2");
}
:root {
  --font-display: "Nunito", ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", sans-serif;
}
```
Nunito is self-hosted (`public/fonts/`, SIL OFL 1.1 licence carried in
`public/fonts/Nunito-OFL.txt`), Latin-only, loaded as **two static files**
(700 and 800 weight) rather than a variable font, and used only for display
text (titles, card names, overlay title/badges) — body/UI copy on every page
falls back to the system font stack
(`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
sans-serif`). Weight 800 is used by exactly one rule sitewide (Honeycomb's
`.tile-label`); everything else uses 700 (CSS resolves `font-weight: 600`
against these two faces to the 700 file, since only 700/800 exist). Bubble
Tap imports **no** webfont at all and is deliberately system-font only.

Because color/radius/spacing/shadow are per-game, there is no single table
to give — each game re-declares the same *names*. Below is the naming
convention plus **Flip It's actual values** as the representative example,
and the homepage's separate (different-naming) token set for contrast:

**Game-shell token names** (declared per-game, consumed by `shell.css` /
`howto.css` / `leaderboard.css`): `--bg`, `--ink`, `--ink-soft`, `--line`,
`--accent`, `--accent-dark`, `--scrim` (optional, backdrop tint), `--record`
(optional, "new record" colour, falls back to `--accent-dark`). Games add
further ad hoc tokens for their own board art (e.g. Flip It's `--on-hi`/
`--off-lo`/`--ripple-hi`/`--tile-drop`/`--peach`, Untangle's `--edge`/
`--node`/`--node-fixed`, Honeycomb's `--tile-hidden`/`--danger`/`--success`)
— these are one-off per game, not shared names.

Flip It (`src/flip-it/style.css`), light → dark:
| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fdf6e9` | `#070b16` |
| `--ink` | `#17233f` | `#eaf6ff` |
| `--ink-soft` | `#6f7a92` | `#7f93b3` |
| `--line` | `#ece2d2` | `#1b2942` |
| `--accent` | `#4db2e8` | `#22d3ee` |
| `--accent-dark` | `#2b8fc7` | `#0fb6d4` |
| `--record` | `#f0891f` | `#ff8a3d` |
| `--scrim` | `rgba(40,32,20,0.35)` | `rgba(0,0,0,0.6)` |

Homepage (`src/style.css`) has its **own, differently-named** token set —
`--bg`, `--surface`, `--text`, `--text-secondary`, `--border`, `--accent` —
which does not match the game-shell names 1:1 (`--surface`≈card background
has no game-shell equivalent; `--text`/`--text-secondary` correspond to
`--ink`/`--ink-soft`; `--border` corresponds to `--line`). Values, light →
dark: `--bg` `#f6f6fb`→`#0d0e1a`, `--surface` `#ffffff`→`#14132a`, `--text`
`#262b3d`→`#f0eefa`, `--text-secondary` `#767a8c`→`#9b96c4`, `--border`
`#e6e4f2`→`#2c2850`, `--accent` `#8b7fe0`→`#a855f7` (further overridden
per-card, see §2).

**Radius, spacing, shadow are not tokenized anywhere.** Every game hardcodes
its own `border-radius` (e.g. Flip It: 50% icon buttons, 999px pills,
20px sheet corners, 11px thumbnails), spacing (mixes of `px`, `vw`, `svh`,
`clamp()`), and `box-shadow`/glow values (ad hoc `rgba()` or
`color-mix(in srgb, var(--accent) N%, transparent)`) inline, rule by rule.
There is no `--radius-sm/md/lg` or `--space-*` scale to reuse. A new design
system would need to introduce these from scratch.

---

## 5. Leaderboard as it exists today

Source: `src/shared/ui/leaderboard.js` + `README-supabase.sql` (the schema,
run manually in Supabase's SQL editor).

**There is no player identity of any kind.** No name, no email, no login,
no per-player row, no device ID, no cookie tied to a person. It is a single
**global aggregate number per game** (and, for daily games, per game per
calendar day) — effectively a shared "world record" plaque, not a
leaderboard with ranked rows of players. Confirmed directly from the schema:
`game_scores` has no player/user column at all, and the RPC's only inputs
are the slug, the score, and (optionally) a date.

**Schema** (`README-supabase.sql`):
- `game_config(game_slug PK, lower_is_better bool, is_daily bool, label
  text)` — one row per leaderboard-enabled game, e.g. `('flip-it', true,
  false, 'perfect time')`. Read-only to clients (RLS: `select` allowed for
  everyone; `insert/update/delete` revoked from `anon`/`authenticated`).
  Games *without* a row here (Untangle, Doodle On) get a raised exception if
  something tries to submit for them — not a silently-created row.
- `game_scores(game_slug, period, best_score int, updated_at)`, PK
  `(game_slug, period)`. `period` is `'all'` for a normal game or
  `'YYYY-MM-DD'` for a daily game (Word Steps) — so a daily game's record
  resets every day server-side. Same read-open/write-revoked RLS as above.
- The **only write path** is `submit_game_score(p_slug text, p_score int,
  p_day date default null) returns int`, a `security definer` Postgres
  function granted to `anon`/`authenticated`. It looks up `game_config` for
  direction/daily-ness, computes the target period (clamping `p_day` to
  within 1 day of the server's own UTC date, to correct timezone skew for a
  daily game), does an upsert that only overwrites `best_score` when the new
  score is actually better (`lower_is_better` decides `<` vs `>`), and
  **always returns the current best** regardless of whether this call
  improved it.

**Client → server contract** (`leaderboard.js`): a game calls
`submitScore(slug, score, day)` (day only passed for daily games,
formatted `YYYY-MM-DD` via the exported `localDay()` helper, using the
*player's local date*). This POSTs to
`${SUPABASE_URL}/rest/v1/rpc/submit_game_score` with `apikey`/`Authorization:
Bearer` headers using the **anon key** (public, baked into the build via
Vite `define` — see ARCHITECTURE.md §35), body `{p_slug, p_score, p_day?}`,
a 4-second timeout, and `keepalive: true` (so the record still lands if the
player backgrounds/closes the tab right after game over, which is exactly
when this fires). It **never rejects** — any failure (no credentials
configured, network error, timeout, non-2xx, non-numeric response) resolves
to `null`, and callers treat `null` as "say nothing," never an error state.

**What the client gets back**: either `null` ("nothing to show / stay
silent") or a plain number — the current global best for that
game/period, *after* this submission (whether or not this run changed it).
There is no history, no list of past records, no rank/percentile, nothing
about how the current run compares beyond that one number.

**What the end card renders** (`renderGlobalBest(el, {...})`, one shared
five-state state machine reused by every leaderboard game, driving
`#globalBest`/`.overlay-global`):
1. **Hidden entirely** if the build has no Supabase credentials — a
   misconfigured/local build shows no line at all, never an error.
2. **Pending**: `el.textContent = pending` (game-authored string, e.g.
   "Global best …") shown immediately while the network call is in flight.
3. **Unavailable**: network/timeout/error → `unavailable` string (e.g.
   "Global best unavailable").
4. **Record**: this run's score is at least as good as the returned best →
   `recordLabel` string (e.g. "★ New global best ★") and the element gets
   class `.new-global` (bold/coloured via `--record` in `leaderboard.css`).
5. **Plain**: otherwise → `label(best)` (game-authored formatter, e.g.
   `"Fastest perfect solve " + formatTime(best)`).

The game — not this shared module — owns wording, number formatting, and
the win/lose direction check (`isRecord`); the shared module only owns the
network call, the promise plumbing, and toggling the `hidden`/`.new-global`
state. 2 of 8 games (Untangle, Doodle On) have no leaderboard at all by
design (documented in both `games.js` and the SQL comments): Untangle's
puzzle size/difficulty varies per run so "fewest moves" would just reward
whoever got the easiest layout, and Doodle On has no score by design (the
deliverable is the drawing, not a number).

---

## 6. Existing localStorage keys / prefs conventions

No shared prefs helper exists yet (`prefs.js` is only proposed in REPORT.md,
not built — see A10/U1 in the backlog). Every game reads/writes
`localStorage` directly, each with its own key, its own naming convention,
and its own inline `try/catch` (or, in Bubble Tap's case, no catch at all —
U6). Full inventory, from `grep -rn localStorage src/`:

| Key | Game | Holds |
|---|---|---|
| `theme` | homepage (`src/index.html`) | `"light"` \| `"dark"`, read by the theme-bootstrap snippet on every page |
| `twb_sound` | Flip It **and** Bubble Tap (explicitly shared — comment: "shared with bubble-tap: one sound preference") | `"true"`/`"false"` |
| `twb_best` | Bubble Tap | best score (number, no try/catch — U6) |
| `twb_calm` | Bubble Tap | calm-mode toggle |
| `flipIt:v2` | Flip It | per-level best `{moves, ms}` map (comment: "v1 was keyed by board size, before levels" — superseded key not cleaned up) |
| `flipItRecent` | Flip It | recently-seen boards (anti-repeat) |
| `flipItLevel` | Flip It | last-selected difficulty |
| `untangleBestMoves` | Untangle | personal-best move count |
| `slideNOrderBest` | Slide N Order | personal-best move count |
| `honeycombBestTimeMs` | Honeycomb | personal-best time |
| `marbleNostalgiaPlayed` | Marble Nostalgia | "has played before" flag, gates first-time hints |
| `wordSteps:v1` | Word Steps | JSON blob of the daily puzzle's saved progress/state |

Naming is inconsistent on purpose-free grounds: some are `camelCase`
(`untangleBestMoves`), some are `slug:vN` (`flipIt:v2`, `wordSteps:v1`), one
is a `twb_` snake-case prefix shared cross-game (`twb_sound`,
`twb_best`, `twb_calm`). Nothing is namespaced consistently, and nothing
prevents a future key from colliding.

---

## 7. Constraints designers must respect

From `CLAUDE.md`, `ARCHITECTURE.md`, and `.claude/SKILLS/GAME-UI-PHILOSOPHY.md`:

- **Vanilla JS/HTML/CSS only, no runtime dependencies.** Every game ships as
  plain `<script type="module">` + hand-written CSS. No React/Vue/animation
  libraries/CSS frameworks. Vite is a **build tool only** — it bundles and
  emits static output; it is explicitly not an application framework here.
- **MPA, not SPA.** Every game is its own HTML entry/page (`src/<slug>/`),
  its own independent Rollup dependency graph. `ARCHITECTURE.md` §22
  explicitly forbids the homepage (or any page) importing another game's
  code. Shared code lives only under `src/shared/` and must stay small (it
  becomes its own shared chunk automatically).
- **Bundle budgets, per page, gzipped** (`ARCHITECTURE.md` §23, enforced by
  `npm run check:bundles`, `scripts/check-bundles.js`): **~50 KB JS**,
  **~30 KB CSS**, **~100–150 KB initial game assets**. Guidelines, not hard
  limits, but exceeding one should trigger investigation and any new
  asset/dependency needs justification. A redesign that adds an icon font,
  an animation library, or heavy imagery risks blowing these per-page, not
  site-wide.
- **`svh`, not `vh`/`dvh`, for every game layout length.** Games fill the
  viewport and never scroll internally; `html,body{height:100svh}` plus
  every padding/gap/board-dimension/`clamp()` bound in `svh` too. Mixing
  units caused a real bug (top bar appearing above the visible screen on
  in-app browsers) — see `base.css`'s long comment.
- **Safe-area is currently mostly broken, not absent by design** (U2): only
  Bubble Tap and the homepage set `viewport-fit=cover`, so `env(
  safe-area-inset-*)` resolves to 0 everywhere else. A redesign should either
  fix this (add `viewport-fit=cover` + real inset padding sitewide) or at
  least not assume it already works.
- **Reduced motion is inconsistently handled today** (U4): some games have
  no `prefers-reduced-motion` rule at all (Marble Nostalgia, Bubble Tap),
  some have one that gets overridden by a more specific selector
  (Honeycomb), one sets a transition inline from JS bypassing CSS media
  queries entirely (Slide N Order), and the shared `howto.css` has no
  reduced-motion variant. A new design system should bake in one consistent
  approach rather than repeat per-game ad hoc rules.
- **"Open. Understand. Play."** — the core philosophy statement. Minimum
  friction between opening a page and interacting with the game; the game
  board itself is the primary visual object, everything else (header, howto,
  stats, controls) is secondary and must not visually compete with it.
- **Priority order** (`CLAUDE.md`): 1) Gameplay, 2) User experience, 3)
  Performance, 4) Simplicity, 5) Reliability, 6) Visual polish — polish is
  explicitly last, so proposals should not trade off higher items for looks.
- **Do not touch `vite.config.js`, `sitemap.xml`, or `vercel.json`** to add
  or change a game — those are derived from the `games.js` registry.
- **Preserve existing game mechanics** — a UX/UI pass must not change how a
  game is actually played unless that's explicitly the ask.
- **Test user-visible behaviour** after any functional/gameplay change
  (Playwright suite, `npm test`), verify against `npm run preview` (a
  successful `npm run build` is not proof a game works).

**~15-bullet summary of `GAME-UI-PHILOSOPHY.md`:**
1. Lightweight and fast is the highest priority — no heavy deps, particle
   systems, video backgrounds, or expensive effects without a clear
   gameplay payoff.
2. Prefer CSS transitions over JS animation loops; simple DOM; small assets.
3. The game board is the interface — hierarchy is game → immediate feedback
   → essential controls → secondary actions; nothing else should compete.
4. Every game should have a Share button.
5. "Remove before adding" — solve UX problems with spacing/grouping/
   feedback/hierarchy before reaching for a new label, button, or card.
6. Every interaction (tap, valid/invalid, progress, success, failure,
   completion) needs quick, unambiguous feedback; UI must never imply the
   wrong element changed.
7. Touch is a first-class input: prevent double-tap zoom, stray text
   selection, and gesture conflicts; touch targets big but not visually
   bulky; rapid taps must stay reliable.
8. **Dark mode = "Neon Arcade":** dark backgrounds, strong contrast,
   selective neon colour, glow reserved for active/selected/success/critical
   states only — not glowing everything.
9. **Light mode = "Soft Pop":** soft, warm/gentle, rounded-but-not-childish,
   simple depth, friendly feedback, not card-heavy or over-gradiented — a
   genuinely different mood from dark mode, not just an inverted palette.
10. Themes change colour/contrast/shadow/glow/mood, not structure or layout
    — one interaction model and shared tokens/CSS variables across both.
11. Motion should communicate state change (what moved/was selected/
    succeeded/failed), never motion for its own sake; respect
    reduced-motion.
12. A game should be understandable within seconds via layout/affordance/
    short prompts, not instruction blocks — howto text should explain only
    what the game itself can't teach.
13. One lightweight responsive system across phone/tablet/laptop/desktop
    (not separate device-specific UIs); prefer flexbox/grid, `clamp()`,
    relative sizing, few breakpoints; do not just shrink the desktop layout
    for mobile or stretch it forever for wide screens.
14. Under space pressure: preserve interaction, preserve touch usability,
    reduce/reposition secondary UI, simplify the surrounding layout — in
    that order — before ever squeezing the game board itself.
15. Colour must be judged in relation to the whole screen, not in isolation
    — a game can use off-theme colours if their saturation/warmth is
    controlled so they still feel like they belong to the active theme.

---

## 8. Known UX gaps already logged in `REPORT.md` (U1–U12)

- **U1.** Six of eight games play no sound and have no mute control; the two
  that do (Flip It, Bubble Tap) never call `AudioContext.resume()`, so audio
  can die silently after a tab switch.
- **U2.** Safe-area bottom padding in `howto.css` is dead code in 7 of 8
  games — only Bubble Tap and the homepage set `viewport-fit=cover`, so the
  last howto bullet sits under the home indicator on notched phones
  elsewhere.
- **U3.** The end-of-game overlay isn't a real modal anywhere — restart,
  level buttons, and the howto link stay clickable through it; no Escape
  key, no focus management.
- **U4.** `prefers-reduced-motion` is ignored (Marble Nostalgia, Bubble Tap
  have no rule) or leaks past overrides (Honeycomb's loss animation, Slide N
  Order's inline JS transition, and `howto.css` has no reduced-motion
  variant at all).
- **U5.** Word Steps computes its "which day is it" index once at page load,
  so an unsolved tab left open past midnight keeps serving yesterday's
  puzzle.
- **U6.** Bubble Tap can throw in private/incognito mode — two
  `localStorage` calls (`app.js:82`, `app.js:519`) have no try/catch; its
  settings panel can also open on top of an already-shown game-over screen.
- **U7.** Keyboard/screen-reader gaps: `role="img"` on interactive boards
  (Honeycomb, Untangle), `role="status"` misused on buttons, toggles that
  never update `aria-checked`, exactly one `:focus-visible` rule sitewide,
  and six of eight boards have no keyboard play path at all.
- **U8.** Only 3 games (Flip It, Word Steps, Doodle On) actively adapt for
  short/landscape viewports, and the test suite never runs a landscape
  pass.
- **U9.** No theme toggle exists inside a game page — arriving via a shared
  game link means leaving to the homepage just to switch light/dark.
- **U10.** Copy has drifted across games: "Again" appears in 4 places, "Play
  Again" in 2, "PLAY AGAIN" in 1 more; "Link copied" appears 5 times
  alongside "Copied!" and "Saved"; one circular-arrow icon glyph is reused
  for 5 different meanings.
- **U11.** Some games read their own game state back out of the DOM instead
  of from a JS model (Untangle parses a crossings count from a `<span>`,
  Slide N Order trusts a tile's `dataset.index`, Word Steps rebuilds the
  current word from `textContent`) — a pure copy edit can silently become a
  logic bug.
- **U12.** Word Steps statically ships its entire 4,349-word dictionary
  (~16 KB gzipped, vs 3–6 KB for other games' JS) — under budget today, but
  a lazy `import()` would be a free win.

---

## 9. Copy inventory

**Overlay/end-card titles** (one per game, static text in each game's own
`index.html`, hard-coded — Honeycomb's "HIVE SPLIT" is actually its loss
title, not a win title):

| Game | End-card title | Sample sub-line |
|---|---|---|
| Marble Nostalgia | `SOLVED` | "1 marble left" |
| Bubble Tap | `BOOM.` (with a `FINAL SCORE` label above the score) | — |
| Slide N Order | `SOLVED` | "24 moves" |
| Flip It | `CLEARED!` (+ `PERFECT` pill badge when optimal) | "YOU 9 MOVES · OPTIMAL 8" |
| Word Steps | `SOLVED` | "COLD → WARM" |
| Untangle | `UNTANGLED` | "14 moves · 22s" |
| Honeycomb | `HIVE SPLIT` | "Time 0:00 · Best --:--" |
| Doodle On | `YOU MADE THIS` | "Circle → something that lives in water" |

**"Play again" button label — 3 different strings, U10:**
- `"Again"` — Marble Nostalgia, Untangle, Slide N Order
- `"Play Again"` — Flip It, Honeycomb
- `"PLAY AGAIN"` (all-caps, different button class `.btn`) — Bubble Tap
- Doodle On and Word Steps use an icon+text button (their `#againBtn`
  contains child markup, not a plain text label)

**Share button label**: `"Share"` everywhere except Bubble Tap
(`"SHARE SCORE"`, all-caps) and Word Steps/Doodle On (icon + "Share" as
child markup).

**Share-note (post-share confirmation) copy — 3 different strings, U10:**
- `"Link copied"` — Marble Nostalgia, Slide N Order, Untangle, Honeycomb,
  Flip It (5 games)
- `"Copied!"` — Word Steps
- `"Saved"` — Doodle On (because it shares/saves an image, not a link)

**Howto sheet title**: uniformly `"How to play"` — both the opener link
(`.howto-link`) and the sheet's own `<p class="howto-title">` use the exact
same string in all 8 games. This is the one piece of end-card-adjacent copy
that is *not* drifted.

**Icon reuse (U10)**: the same circular-arrow SVG glyph is used across games
for "reset board," "new puzzle/board," "play again," and (mirrored) "back" —
5 different meanings sharing visually similar iconography, which is worth a
designer's attention when defining an icon set.

**Homepage FAQ copy** (exact, from `src/index.html`):
- "Are the games on Tap When Bored free?" → "Yes. Every game is free to
  play, with no in-app purchases."
- "Do I need to sign up or download anything?" → "No. There's no signup and
  nothing to install — each game opens straight in your browser."
- "Do the games work on mobile?" → "Yes. Every game is built for touch and
  works on phones, tablets, and desktop browsers."

---

## Screenshots (`research/shots/current/`)

Captured against `npx vite --port 5199 --strictPart` (dev server), Chromium
via Playwright, deviceScaleFactor 2 on mobile shots.

| File | Description |
|---|---|
| `home-mobile-light.png` | Homepage, 390×844, light theme |
| `home-mobile-dark.png` | Homepage, 390×844, dark theme (Neon Arcade card glow) |
| `home-desktop-light.png` | Homepage, 1280×800, light theme |
| `home-desktop-dark.png` | Homepage, 1280×800, dark theme |
| `flip-it-mobile-light.png` | Flip It game page, 390×844, light theme, board idle |
| `flip-it-desktop-light.png` | Flip It game page, 1280×800, light theme |
| `untangle-mobile-light.png` | Untangle game page, 390×844, light theme |
| `untangle-desktop-light.png` | Untangle game page, 1280×800, light theme |
| `flip-it-endcard-mobile-light.png` | Flip It end-of-game overlay, 390×844, light theme — triggered by scripting the overlay's DOM state directly (`overlayBadge`/`overlaySub`/`overlayTime`/`globalBest` filled, `.show` class added) rather than actually solving the puzzle; shows the "PERFECT" badge and "New global best" state live |

All 9 requested shots were captured; nothing was skipped.
