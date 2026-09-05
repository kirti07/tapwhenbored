# Tap When Bored, platform review

Date 2026-09-05, branch `main` at `90bf561`.

Short version. The site is healthy at 8 games and will hurt at 20. The cause is
one thing repeated in different forms. Each game carries its own copy of the
platform, so every platform change is eight edits. The fix is two small shared
modules and a handful of validator checks, nothing that changes a URL or adds a
dependency.

Every finding has an ID so we can point at it later. `A` is architecture, `U`
is UX, `P` is the offline PWA spec at the end. The HTML version of this report is `REPORT.html`.

## Snapshot

| Check | Result |
| --- | --- |
| `npm run validate` | 8 games ok |
| `npm run build` | clean, 29 modules, 189 ms |
| `check:bundles` | every page under budget, heaviest is word-steps at 16.0 kB JS gzipped vs 50 kB |
| `npm test` | 327 passed, 1 skipped, 46 s |
| Bare `vh` in game CSS | 0 |
| Fresh `npm run game:new` | validates, then fails 2 of 18 smoke tests |

---

## What's working

- One folder per game. Vite builds each as its own page. A game can't break another game.
- One registry file, `src/data/games.js`, feeds the homepage cards, JSON-LD, sitemap and smoke tests.
- The validator checks registry against filesystem in both directions, and against the SQL seed.
- Score direction lives in the database. The client never compares scores.
- Only two env var names reach the browser, and the build refuses to run if a secret-looking one is set.
- `svh` everywhere, no bare `vh`, and a test that proves scroll recovery works.
- Font preloads are pinned to real usage by a test.
- Two dev dependencies, zero runtime dependencies.

## What's not working, architecture

Ranked by how much it hurts at game #20.

- **A1. Every platform change touches every game.** Each page pastes ~45 head lines (OG, Twitter, JSON-LD, preloads) and ~60 lines of shell JS (howto, share, overlay) by hand. Roughly 450 duplicated lines. Git shows it: `680a44e`, `f13cbad`, `ef1d12c`, `2149379` each touched all game folders.
- **A2. Adding a game needs a hidden CSS edit.** Each game needs a light and dark `.card--<slug>` rule in `src/style.css` for its homepage card colour. Nothing validates it. Forget it and the card ships purple.
- **A3. The scaffold writes stale rules.** `scripts/new-game.js` uses `dvh` not `svh`, preloads a font only Honeycomb uses, skips `touch-action` and `color-scheme`. A fresh game fails 2 of its own smoke tests. Verified by scaffolding a probe.
- **A4. The validator skips most head tags.** Only canonical and `og:url` are checked. Description, images, JSON-LD name, theme colour, viewport string and font preloads match today only because someone was careful. Honeycomb's theme colour is already off by one hex digit.
- **A5. The homepage intro hardcodes the catalogue.** `src/index.html` names games by hand and already describes Doodle On wrong.
- **A6. Theme colours live in four files.** `#f6f6fb` and `#0d0e1a` sit in `vite.config.js`, `src/index.html`, the manifest and `src/style.css`.
- **A7. A registry field nothing reads.** `leaderboard.unit` has no consumer. Same for `game_config.label` in the SQL.
- **A8. Docs describe deleted features.** `tokens.css` header still explains the service worker. Brand README has the wrong manifest colour. ARCHITECTURE §7 lists 2 scripts, there are 5. `.gitignore` has a stray entry.
- **A9. Bubble Tap is a fork of the shell.** Own topbar, own overlay z-index, own class names, no `tokens.css` or `shell.css`, and `hasOverlay: false` exists only to exempt it. Every shell test carries a Bubble Tap exception.
- **A10. Prefs are shared by coincidence.** Flip It and Bubble Tap agree on the `twb_sound` key only because a comment says so. Three localStorage naming conventions across the repo.
- **A11. Small things.** Dead `js += 0;` in check-bundles. No `.nvmrc`. A ternary in `playwright.config.js` with the same value on both sides.

## What's not working, UX

Ranked by player impact. All from reading source. Nobody has opened these in a
real browser yet, and that should be the first UX task.

- **U1. Six games play sound with no mute.** Only Flip It and Bubble Tap have one. Five games never call `AudioContext.resume()`, so audio can die after a tab switch and stay dead.
- **U2. Safe-area padding is dead code in seven games.** `howto.css` pads by `env(safe-area-inset-bottom)` but only Bubble Tap and the homepage set `viewport-fit=cover`, so the value is 0. Last bullet of the sheet sits under the home indicator on notched phones.
- **U3. The end card isn't modal, anywhere.** Restart, level buttons and the howto link stay clickable through it. No Escape, no focus move.
- **U4. Reduced motion is ignored or leaks.** Marble Nostalgia and Bubble Tap have no rule at all. Honeycomb's loss animation out-specifies its override. Slide N Order sets a transition inline from JS. Shared `howto.css` has no reduced-motion variant.
- **U5. Word Steps keeps yesterday's puzzle.** Day index is computed once at load. Leave an unsolved tab open past midnight and it's stale.
- **U6. Bubble Tap can die in private mode.** Two `localStorage` calls with no try/catch (`app.js:82`, `app.js:519`). Settings can also open on top of game over.
- **U7. Keyboard and screen reader gaps.** `role="img"` on interactive boards in Honeycomb and Untangle. `role="status"` on buttons. Toggles that never set `aria-checked`. One `:focus-visible` rule in the whole site. Six boards can't be played by keyboard.
- **U8. Landscape is handled by three games.** Only Flip It, Word Steps and Doodle On trim for short viewports. Tests never run landscape.
- **U9. No theme toggle inside a game.** Land from a shared link and you have to leave to change it.
- **U10. Copy drift.** "Again" x4, "Play Again" x2, "PLAY AGAIN". "Link copied" x5, "Copied!", "Saved". One circular-arrow glyph with five meanings.
- **U11. Game state read back from the DOM.** Untangle parses the crossings count from a span. Slide N Order trusts `dataset.index`. Word Steps builds the word from `textContent`. A copy tweak becomes a logic bug.
- **U12. Word Steps ships a 4,349-word dictionary statically.** 16 kB gzipped vs 3 to 6 kB for the others. Under budget, but a lazy `import()` is a free win.

## Consistency scoreboard

| Surface | State |
| --- | --- |
| `svh`, `touch-action`, `html,body` height | Consistent across 8 |
| Howto sheet geometry, global-best line | Consistent, test-enforced |
| `.title` size | 3 variants |
| `.stage` bottom padding | 3 variants |
| Again button label | 5 variants |
| Share-note text | 4 variants |
| `viewport-fit=cover` | 2 of 9 pages |
| `color-scheme` declared | 3 of 9 |
| `:focus-visible` styling | 1 rule site-wide |
| `prefers-reduced-motion` | 0 rules in 2 games, partial elsewhere |
| Short-viewport media query | 3 of 8 |
| Sound mute | 2 of 8, though all 8 make sound |
| `AudioContext.resume()` | 3 of 8 |
| Escape closes sheet or overlay | 0 of 8 |
| Keyboard-operable board | 2 of 8 |
| Overlay focus management | 0 of 8 |
| Theme toggle inside a game | 0 of 8 |

---

## Proposal

Architecture first, then UX. The UX items that matter most (mute, safe-area,
modal end card, theme toggle) are shell problems. Done per game they are eight
edits each and drift within a month. Done in the shell they are one edit and a
test.

### Architecture, in order

| # | Change | Size | Closes |
| --- | --- | --- | --- |
| 1 | Regenerate the scaffold from Untangle. Add a CI step that scaffolds a probe game, runs its smoke tests, cleans up. | half a day | A3 |
| 2 | Move card accent colours into the registry. Homepage plugin writes them as inline CSS vars. Delete 16 rules and `cardClass`. | 1 h | A2 |
| 3 | `headFromRegistry()` Vite plugin, same shape as `homepageFromRegistry()`. Pages keep a `<!-- head-meta -->` marker. Needs two new registry fields, `genre` and `ogDescription`. | half a day | A1 (head), most of A4 |
| 4 | `src/shared/ui/shell.js` exporting `initHowto()`, `initShare({...})`, `bindOverlay(el)`. No state, no lifecycle, no growing options object. | 1 day | A1 (JS) |
| 5 | `src/shared/ui/prefs.js` with `get`, `set`, try/catch inside, `twb:` prefix. Sound control in the shell. | with UX | A10, U1 |
| 6 | Sweep. Validator checks for theme colour, viewport, preloads. Catalogue-agnostic intro. Theme colours into the registry. Delete `unit`. Fix docs. | half a day | A4 leftovers, A5 to A8, A11 |
| 7 | Migrate Bubble Tap onto the template. Remove `hasOverlay` and every test exception. | 1 day | A9, U6 |

Item 4 is the only one that needs judgment. The temptation is to let it grow
into a game engine. Hold it at three functions.

### UX, in order

| # | Change | Depends on |
| --- | --- | --- |
| 1 | Browser pass at 390x844, 360x640 landscape, 1280x800, both themes, all 9 pages. Screenshots into `REPORT-shots/`. | nothing |
| 2 | `viewport-fit=cover` on every page, then pad topbars for `safe-area-inset-top`. | head plugin |
| 3 | Shared mute button and theme toggle in `.top-actions`. | `shell.js`, `prefs.js` |
| 4 | Modal end card. Disable `.top-actions` while ended, Escape closes, focus moves to the primary button. | `bindOverlay()` |
| 5 | Reduced-motion sweep, including `howto.css`. | nothing |
| 6 | Word Steps day rollover on `visibilitychange`. Bubble Tap localStorage try/catch. | nothing |
| 7 | Fix roles and aria. Add `:focus-visible` to `shell.css`. | nothing |
| 8 | Landscape rule in `shell.css` plus one landscape smoke case. | nothing |
| 9 | Copy pass, DOM-state cleanups, lazy dictionary. | nothing |

---

## How it looks after

Today every game folder holds three things. Its own head tags, its own copy of
the shell JS, and the game itself. After, the first two come from one place.

```
TODAY                                   AFTER

src/data/games.js                       src/data/games.js
  (title, description, og, colours)       (+ genre, ogDescription, accent, home colours)
        │                                       │
        ├─► homepage                            ├─► homepage (cards get accent inline)
        ├─► sitemap                             ├─► sitemap
        └─► validator                           ├─► validator (+ theme, viewport, preloads)
                                                └─► headFromRegistry() plugin
                                                        │
src/<game>/index.html                   src/<game>/index.html
  ├─ 45 lines of head, by hand            ├─ <!-- head-meta -->  ◄──────┘
  ├─ topbar + howto + overlay markup       ├─ topbar + howto + overlay markup
  └─ board                                 └─ board

src/<game>/game.js                      src/<game>/game.js
  ├─ openHowto / closeHowto               ├─ import { initHowto, initShare,
  ├─ shareResult / showShareNote          │            bindOverlay } from shell.js
  ├─ showOverlay / hideOverlay            ├─ import prefs from prefs.js
  ├─ sound toggle (2 of 8)                └─ game logic only
  ├─ localStorage try/catch (7 of 8)
  └─ game logic                         src/shared/ui/
                                          ├─ leaderboard.js   (exists)
src/shared/ui/                            ├─ shell.js         (new, 3 functions)
  └─ leaderboard.js                       └─ prefs.js         (new, 2 functions)

Platform change = 8 edits               Platform change = 1 edit + 1 test
New game = folder + registry + CSS      New game = folder + registry
```

Shared code stays under §9. Both new modules standardise the edges and leave
the games alone.

---

## Offline PWA, spec

`P` items are decisions, not findings. Research done 2026-09-05 against
vite-plugin-pwa 1.3.0, Workbox 7.4.1, Serwist 9.5.12, Playwright 1.62, Safari
26, Chrome stable.

Today the app is installable and nothing else. §19 of `ARCHITECTURE.md` says
offline is "a feature to add back on purpose". This is that. §41 lists "eager
caching of all games" as something to avoid. The numbers below are the reason
to overturn it, and §39 question 7 is answered here rather than dodged.

### The promise

- Visit once, or add to the home screen, and every game on the shelf plays
  offline from the next launch. Not only the games you happened to open.
- A deploy reaches an installed app on its next launch. A game in play is never
  reloaded under the player.
- Leaderboards and analytics still go to the network and degrade as they do
  today (§20). Nothing about gameplay changes.

### Numbers that decide the shape

Measured on the current `dist/`, all 8 games plus the scaffold probe.

| What | Raw | Gzipped | Cached? |
| --- | ---: | ---: | --- |
| Every `/static/` JS and CSS file | 219 kB | 55 kB | yes |
| Every document, 9 pages | 82 kB | 12 kB | yes |
| Every card thumbnail | 52 kB | 35 kB | yes |
| Two webfonts | 31 kB | 31 kB | yes |
| Icons, manifest, favicon | 67 kB | 60 kB | yes |
| OG images, `/assets/*-og.jpg` | 374 kB | 334 kB | never, no page loads them |

The whole playable site is about 190 kB gzipped. A game costs 3 to 6 kB of
code, Word Steps 16 kB, plus a document of about 1.3 kB and a thumbnail of 1 to
5 kB. Fifty games land near 700 kB, which is still less than one OG image. The
old worker spent 276 lines and most of three architecture sections keeping
install size proportional to games opened. At these sizes that scheme cost more
than it saved.

### P1. Tool: vite-plugin-pwa in `injectManifest` mode

`vite-plugin-pwa` 1.3.0 (May 2026) on Workbox 7.4.1 (May 2026). Supports Vite
7. Dev dependency only; nothing from it ships inside a page. The worker is our
own ~25-line file that imports `workbox-precaching` and `workbox-core`, and the
plugin bundles it into one self-contained `/sw.js` and injects the precache
manifest at `self.__WB_MANIFEST`.

Why this and not the alternatives:

| Option | Verdict |
| --- | --- |
| Hand-rolled worker, as before | What got deleted was 276 lines of worker, 75 of register, 492 of tests, and most of the prose was about revisions, cache order and eviction. That is exactly what `workbox-precaching` does: revisioned manifest, atomic install, outdated-cache cleanup. |
| `generateSW` mode | Config only. Its defaults assume an SPA (`navigateFallback` to `index.html`) and it cannot express the one-off cleanup of legacy `twb-*` caches. We would spend the config fighting it. |
| Serwist (`@serwist/vite`) | Maintained Workbox fork, 9.5.12 in July 2026, same API. Workbox itself shipped 7.4.0 in Nov 2025 and 7.4.1 in May 2026, so it is not stale. Pick the plugin with Vite as a first-class target. Serwist is the swap if Workbox stalls again. Same worker code either way. |

Cost, said plainly: `workbox-build` pulls a large transitive tree (Rollup,
Babel) into `node_modules`. `npm ci` gets slower. It never reaches the browser.
Dev dependencies go from 2 to 5 (`vite-plugin-pwa`, `workbox-precaching`,
`workbox-core`). The runtime stays at zero.

### P2. What gets cached

One precache, filled atomically on install, diffed by revision on update.

| Precached | Excluded |
| --- | --- |
| every document, `index.html` and `<slug>/index.html` | `/assets/*-og.jpg` |
| everything under `/static/` | `sw.js`, `sitemap.xml`, `robots.txt` |
| `/assets/*-thumb.*`, `/fonts/*.woff2`, `/icons/*.png` | anything cross-origin |
| `/manifest.webmanifest`, `/favicon.svg` | |

`/static/` names are content hashes, so those entries carry no revision and no
cache-busting query (`dontCacheBustURLsMatching: /^static\//`). Documents and
`public/` files are unhashed, so Workbox hashes their content into the
manifest. A thumbnail edit changes its revision and refetches only that file.

There are no runtime caching routes. A request that is not in the precache goes
to the network untouched, cross-origin included. That is what keeps the
`page.route` leaderboard mocks in the smoke tests working: Playwright cannot see
a request the worker answers, so the worker must answer only for its own files.

### P3. Shared links and slashless URLs

`ignoreURLParametersMatching: [/.*/]`, so `/flip-it/?moves=12&size=5` hits the
precached document. Four games read parameters from `location.search`, never
from the document, so this is safe and it was the old worker's `cacheKey()`
lesson. `urlManipulation` adds a trailing-slash candidate, so `/honeycomb`
resolves offline the way Vercel's 308 resolves it online.

### P4. No offline fallback page

Every page is precached, so an offline miss is a URL that does not exist. Keep
the browser's own error page. `navigateFallback` stays off. This is an MPA and
answering a navigation with the homepage would break gameplay and SEO.

### P5. Update flow

```
deploy
  → next navigation, or registration.update() on resume
  → browser fetches /sw.js, byte-different
  → install: fetch only entries whose revision changed
  → skipWaiting
  → activate: cleanupOutdatedCaches, drop entries not in the manifest,
              delete legacy twb-* caches
  → clientsClaim
  → every open page receives controllerchange
```

The worker calls `skipWaiting()` and `clientsClaim()` unconditionally. That is
safe in an MPA because a page never fetches its own modules twice and
`/static/` files are immutable. It imposes one rule on games: load everything
you play with before play begins. The lazy dictionary in U12 still gets
imported at page load, just off the critical path, or a mid-game update could
remove the chunk it later asks for.

`/sw.js` is served with `Cache-Control: public, max-age=0, must-revalidate`.
That is Vercel's default for a file outside `/static/`, written into
`vercel.json` explicitly so nobody widens a rule onto it. Browsers ignore HTTP
caching of the worker script beyond 24 hours regardless.

### P6. The page-side snippet

`scripts/sw-register.js`, about 40 lines, inlined into every page by the same
plugin that inlines the theme bootstrap. It replaces `scripts/sw-cleanup.js`,
which must go in the same commit because it unregisters every worker on every
load.

- Registers after `load`, so it never competes with the page.
- Records whether a controller existed before registering.
- On `controllerchange`, reloads only when all three hold: this is the homepage,
  a controller existed before, and the player has not touched the page
  (pointerdown, keydown, wheel, scroll). The new homepage is already in the
  precache, so the reload works offline. A game page never reloads.
- On `visibilitychange` to visible, calls `registration.update()`, throttled to
  once per 15 minutes. A resumed installed app never navigates, so without this
  nothing would check for a build.
- In `display-mode: standalone`, calls `navigator.storage.persist()`. Chrome
  grants it silently for installed apps. Firefox shows a prompt, which is why
  it is gated on standalone.

`injectRegister: null`. No `workbox-window`, no `virtual:pwa-register`. The
homepage ships no JavaScript today and should not gain 3 kB of library for a
40-line job.

### P7. Platform notes, verified September 2026

| Platform | What holds |
| --- | --- |
| Chrome, Android and desktop | Installable without a worker since 108 and 112. Persistent storage auto-granted once installed. |
| iOS and iPadOS 26 | Anything added to the Home Screen now opens as a web app. The home-screen app has its own storage and its own days-of-use counter. ITP's 7-day script-storage purge applies to Safari tab use, and Apple says first-party data in home-screen apps is not expected to be deleted. Safari 17+ raised quota and added the Persistent Storage API. |
| iOS consequence | The installed app registers the worker on its own first launch, since storage is separate from the Safari tab. First launch needs the network. Second launch works offline. |
| Playwright | Service workers run in Chromium only. `context.setOffline(true)` works with a worker. `page.route` cannot intercept the worker's own script fetch, so the update test dispatches `controllerchange` synthetically, as the old suite did. |
| Dev server | No worker in dev (`devOptions.enabled: false`). Different port from preview, so nothing leaks. Preview gets the real one and tests run there. |

### P8. Files

| File | Change |
| --- | --- |
| `src/pwa/sw.js` | new. `precacheAndRoute`, `cleanupOutdatedCaches`, `skipWaiting`, `clientsClaim`, one activate handler deleting `twb-*`. No `index.html`, so it is not a page. |
| `scripts/sw-register.js` | new, P6 |
| `vite.config.js` | `pwa()` becomes `VitePWA({ strategies: "injectManifest", srcDir: "pwa", filename: "sw.js", manifest: false, injectRegister: null, devOptions: { enabled: false }, injectManifest: { globPatterns, globIgnores, dontCacheBustURLsMatching } })` plus the existing manifest and icon link injection and the new snippet. |
| `public/sw.js` | delete. The plugin emits `/sw.js`. A public copy collides. The new worker is byte-different from both the tombstone and the old caching worker, so it replaces either on a device that still has one, and its activate step drops their caches. |
| `scripts/sw-cleanup.js` | delete, same commit |
| `public/manifest.webmanifest` | unchanged, `manifest: false` keeps ours |
| `vercel.json` | `/sw.js` header, P5 |
| `package.json` | three dev dependencies, P1 |
| `scripts/check-bundles.js` | one more line, "precache total", warn above 1 MB gzipped. Today about 190 kB. |
| `tests/pwa/pwa.spec.js` | rewrite, P9 |
| `ARCHITECTURE.md` | §7 tree, §18, §19, §21, §30, §36 rewritten from this section. §41 swaps "eager caching of all games" for "a precache without a budget". `tokens.css` header fixed at the same time (A8). |

Half a day including tests. One PR, independent of every A and U item. The PR
description answers the nine §39 questions.

### P9. Tests

All in `tests/pwa/`, Chromium, against preview.

1. Every registry page registers and gets a controller.
2. The precache holds every registry page, its `/static/` files and its
   thumbnail, and holds no `-og.jpg`.
3. `setOffline(true)`, then open every game. The board renders and restart works.
4. Offline, `/flip-it/?moves=12&size=5` is served, and so is `/honeycomb`
   without the slash.
5. Synthetic `controllerchange`. Untouched homepage reloads. After a
   `pointerdown` it does not. A game page does not. A first install does not.
6. A leaderboard request still reaches the `page.route` mock with a worker live.
7. `visibilitychange` calls `registration.update()` once, not twice within
   15 minutes.
8. `storage.persist()` is called in standalone and not in a tab, using the
   existing `asInstalledApp()` stub.

Manual, once per release that touches the worker: real iPhone and real Android.
Install, kill the app, airplane mode, launch, play two games, check a deploy
shows on the next launch.
