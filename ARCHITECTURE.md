# Tap When Bored — Architecture

# 1. Purpose

Tap When Bored is a collection of lightweight, single-player browser games designed for fast loading, immediate play, simple interaction, and high replayability.

The architecture is optimized for:

* Many independent games
* Very small initial payloads
* Fast page loads
* Mobile and desktop play
* Installable PWA experience
* Offline-capable gameplay
* Independent game development
* AI-assisted development
* Automated functional testing
* Simple deployment
* Minimal shared runtime complexity

The system should make adding game #50 nearly as straightforward as adding game
#5. Concretely: adding a game means creating `src/<slug>/` and one registry
entry. It must never require editing the build configuration, the sitemap, or
`vercel.json`.

---

# 2. Core Architectural Principle

> **Standardize the edges, not the games.**

Games should share infrastructure where it provides clear value, but each game should remain free to implement its own:

* Game mechanics
* State model
* Rendering
* Input handling
* Level generation
* Scoring
* Animation
* Game-specific UI
* Game-specific dependencies

The architecture standardizes the things around the games:

* Build
* Deployment
* PWA
* Theme
* Common shell
* Metadata
* Game registry
* Validation
* Testing
* Performance budgets
* Development workflow

---

# 3. Architectural Decisions

| Concern                | Decision                          |
| ---------------------- | --------------------------------- |
| Build tool             | Vite                              |
| Runtime architecture   | Multi-Page Application            |
| UI framework           | None                              |
| Game implementation    | Vanilla JS                        |
| Styling                | CSS                               |
| Deployment             | Vercel                            |
| PWA                    | Web App Manifest + Service Worker |
| Offline gameplay       | Yes                               |
| Backend                | None                           |
| Leaderboards           | Supabase            |
| Browser testing        | Playwright                        |
| Game catalogue         | Central registry                  |
| SEO                    | Build-time/static                 |
| Shared gameplay engine | No                                |
| Shared infrastructure  | Small, explicit modules only      |
| Client-side router     | No                                |
| URL structure          | Flat `/<slug>/` — permanent       |
| Vite project root      | `src/`                            |
| Build output           | `dist/`                           |
| Trailing slash         | Canonical, enforced in Vercel     |
| Game discovery         | Filesystem, validated vs registry |
| Offline model          | Visited games become offline-capable |

---

# 4. Vite's Role

Vite is used as a **build tool**

Vite is responsible for:

* Development server
* Hot module replacement
* JavaScript bundling
* CSS processing
* Asset handling
* Production builds
* Multiple HTML entry points
* Build-time optimization

Vite must not become a runtime application architecture.

Do not introduce:

* React
* Vue
* SPA routing
* A global client application
* A universal game runtime
* A central JavaScript bundle containing every game

Each game remains a separate page and production dependency graph.

## Constraints Vite imposes on the layout

These are not stylistic preferences. They follow from how Vite builds a
multi-page app, and violating them either changes production URLs or breaks the
build:

1. **A page's emitted path is its source path relative to `root`.** Vite emits
   each page at `posix.relative(config.root, id)`. The `rollupOptions.input` key
   does not affect it — that key only names the page's JS chunk. The directory a
   page lives in *is* its URL.
2. **Every HTML entry must live inside `root`.** A page outside `root` produces a
   `../` emit path, which Rollup rejects. Hence `src/index.html`, not a
   repo-root homepage.
3. **Games are `src/<slug>/index.html`**, never `src/games/<slug>/index.html`,
   because the latter would produce `/games/<slug>/` URLs. See §5.
4. **Only `type="module"` scripts are bundled.** A plain `<script src="game.js">`
   is left untouched in the output HTML *and* the file is never emitted, so the
   page ships a 404 for its own game script. The build still exits 0.
5. **References to `public/` files must be absolute** (`/assets/x.svg`). A
   relative reference is resolved against the importing HTML and fails the build.

---

# 5. Multi-Page Application

Tap When Bored uses an MPA architecture.

Example:

```text
/
├── index.html            →  /
│
├── /honeycomb/
│   └── index.html        →  /honeycomb/
│
├── /doodle-on/
│   └── index.html        →  /doodle-on/
│
├── /untangle/
│   └── index.html        →  /untangle/
│
└── /word-steps/
    └── index.html        →  /word-steps/
```

Each HTML page is a Vite entry point.

The browser loads only the resources required by the current page.

For example:

```text
/honeycomb/

index.html
   ↓
honeycomb JS
honeycomb CSS
honeycomb assets
shared infrastructure actually used
```

It must not load:

```text
doodle-on.js
untangle.js
word-steps.js
slide-n-order.js
...
```

## URL structure is a locked decision

Game URLs are flat and permanent:

```text
https://www.tapwhenbored.com/            homepage
https://www.tapwhenbored.com/<slug>/     one per game
```

These URLs are indexed, carry self-referencing canonical tags, appear in
`sitemap.xml`, and are embedded as absolute `og:url` and `og:image` values that
social platforms have already cached.

> **Live URLs never change.** No `/games/` prefix, no path restructuring, no
> redirect chains. Altering a live game URL is a breaking product change, not a
> refactor.

What follows from it:

1. Game sources are flat directories directly under `src/`, because the source
   directory name *is* the production URL (§4).
2. A directory under `src/` without an `index.html` is not a page — `shared/`,
   `data/`, `assets/`. That absence is the discovery rule (§10, §29).
3. The trailing slash is canonical. `/<slug>` 308-redirects to `/<slug>/`,
   configured once in `vercel.json` and mirrored by dev-server middleware.
4. Dev, `vite preview`, and production serve the same path for the same page. No
   environment-specific path mapping is permitted anywhere in the stack — that is
   what lets one Playwright spec run against every environment.
5. Adding a game adds a URL. It never renames one.

Rejected approaches:

| Approach | Why rejected |
| -------- | ------------ |
| `src/games/<slug>/` sources | Emits `/games/<slug>/` — changes every live URL |
| A build plugin hoisting output out of `games/` | Dev and preview would still serve `/games/<slug>/`; only production would be flat, and the build manifest and service-worker precache list would disagree with real URLs |
| Vercel `rewrites` mapping flat URLs onto `/games/<slug>/` | Production-only indirection that cannot be exercised locally; a catch-all rule shadows every future top-level path |

---

# 6. Why MPA

MPA is preferred because Tap When Bored is fundamentally a collection of independent games rather than one application.

Benefits:

* Small per-game bundles
* Simple URLs
* Strong game isolation
* Simple debugging
* Independent game loading
* Natural browser navigation
* Better failure isolation
* Easy static deployment
* Simple SEO
* Lower architectural complexity

A game should be understandable and runnable without understanding the implementation of another game.

---

# 7. Repository Structure

```text
tap-when-bored/
│
├── package.json              ("type": "module")
├── vite.config.js            (root: src/, outDir: dist/, MPA entries)
├── vercel.json               (buildCommand, outputDirectory, trailingSlash)
├── playwright.config.js
├── CLAUDE.md
├── ARCHITECTURE.md
│
├── src/                      ← Vite root. Layout here IS the URL structure (§5).
│   ├── index.html            →  /
│   ├── style.css             (homepage only)
│   │
│   ├── data/
│   │   └── games.js          registry — portable ESM, browser + Node
│   │
│   ├── shared/               no index.html ⇒ not a page
│   │   ├── css/
│   │   │   ├── tokens.css
│   │   │   ├── base.css
│   │   │   ├── shell.css
│   │   │   ├── howto.css
│   │   │   └── leaderboard.css
│   │   └── ui/
│   │       └── leaderboard.js
│   │                         this is the whole of shared/ui/ — §9 lists what
│   │                         else is allowed to live here, not what does
│   │
│   ├── honeycomb/            →  /honeycomb/
│   │   ├── index.html        mandatory — this file makes it a page
│   │   ├── game.js           loaded as type="module"
│   │   ├── style.css
│   │   └── assets/           game-specific, content-hashed
│   │
│   ├── doodle-on/            →  /doodle-on/
│   └── ...                   one flat directory per game
│
├── scripts/
│   ├── new-game.js
│   └── validate-games.js
│
├── tests/
│   ├── smoke/
│   ├── pwa/
│   └── games/
│
├── public/                   copied verbatim to the dist root; never processed
│   ├── favicon.svg
│   ├── robots.txt
│   ├── manifest.webmanifest
│   ├── icons/
│   └── assets/               crawler-facing images at stable, indexed URLs
│
└── dist/                     build output (gitignored)
```

`sitemap.xml` and `sw.js` are deliberately absent from `public/` — both are
emitted by Vite plugins: the sitemap from the registry (§28), and the service
worker from `scripts/sw-template.js` (§18). Neither can drift.

Games are flat directories under `src/`, not nested under `src/games/`, because
the source directory name is the production URL (§4, §5).

The exact internal structure of a game can vary according to its complexity.

A small game does not need unnecessary abstraction. The only mandatory file is
`index.html`; its presence is what makes the directory a page.

---

# 8. Game Boundaries

Every game is an independent application within the site.

A game owns:

* HTML
* Game state
* Rules
* Rendering
* Input
* Game loop
* Scoring
* Game-specific UI
* Game-specific CSS
* Game-specific assets
* Game-specific dependencies

A game must not directly depend on another game's implementation.

Avoid:

```text
honeycomb → doodle-on → untangle
```

Prefer:

```text
             shared infrastructure
                /    |    \
               /     |     \
        honeycomb  doodle  untangle
```

---

# 9. Shared Infrastructure

Shared code is allowed only when it provides genuine site-wide value.

Examples:

* Theme initialization
* Common CSS tokens
* Common page shell
* Share functionality
* Sound preferences
* Local storage helpers
* Analytics
* Leaderboard client
* Small generic utilities

Shared code must not contain game-specific rules.

Do not create shared abstractions such as:

```text
GameEngine
UniversalLevelGenerator
UniversalRenderer
UniversalInputManager
UniversalGameState
```

unless a concrete, repeated requirement across multiple games justifies them.

The default should be to keep logic inside the game.

---

# 10. Game Registry

`src/data/games.js` is the source of truth for the game catalogue.

It lives inside Vite's root so browser code can import it directly, with no
`/@fs/` escape in dev and no `server.fs.allow` dependency.

Example:

```js
export const games = [
  {
    slug: "honeycomb",
    title: "Honeycomb",
    description: "...",
    path: "/honeycomb/",            // flat (§5) — must equal "/" + slug + "/"
    thumb: "/assets/honeycomb-thumb.svg",
    ogImage: "/assets/honeycomb-og.jpg",
    cardClass: "card--honeycomb",   // homepage modifier; not always the slug
    darkThemeColor: "#14101f",      // must match this game's dark --bg
    category: "puzzle",
    updated: "2026-08-24",          // sitemap lastmod; bump on real change only
    featured: true,
    pwa: true,
    hasRestart: false,              // restarts via the overlay, not a topbar button
    hasOverlay: true,
    leaderboard: {                  // or false ⇒ never contacts Supabase
      lowerIsBetter: true,          //   checked against game_config (§27)
      daily: false,
      unit: "time"                 //   what the number measures
    }
  }
];
```

## Registry constraints

`src/data/games.js` is loaded **both** by the browser and by Node
(`vite.config.js`, `scripts/*.js`), so it must be portable ESM:

* No `import.meta.glob`, no CSS or image imports, no `process.env`.
* Image references are plain absolute strings, not imports.

`slug` must equal the directory name under `src/`, and `path` must equal
`/<slug>/`. Validation enforces both (§29).

Reserved slugs, which would collide with build output or platform paths:
`assets`, `static`, `icons`, `data`, `shared`, `api`, `_vercel`.

The registry should drive:

* Homepage game listings
* Game navigation
* Metadata
* SEO information
* Sitemap generation
* Validation
* Automated smoke tests
* Future analytics
* Future game discovery features

Adding a game should normally require adding one registry entry rather than manually updating multiple unrelated files.

---

# 11. Adding a New Game

A new game should follow this flow:

```text
Idea
 ↓
Game Design
 ↓
Architecture Check
 ↓
Scaffold
 ↓
Core Mechanic
 ↓
Functional Tests
 ↓
UI / Polish
 ↓
UI Review
 ↓
Performance Review
 ↓
Production Build
 ↓
Full Test Suite
 ↓
Ship
```

A new game should not be considered complete merely because it runs locally.

---

# 12. Game Structure

A simple game may contain:

```text
src/<slug>/
├── index.html
├── game.js
└── style.css
```

A more complex game may evolve into:

```text
src/<slug>/
├── index.html
├── main.js
├── game/
│   ├── state.js
│   ├── rules.js
│   ├── generator.js
│   └── renderer.js
├── input.js
├── style.css
└── assets/
```

Do not split files prematurely.

Complexity should determine architecture. A `main.js` whose only content is
`import "./game.js"` is ceremony, not architecture.

`index.html` is mandatory — it is both the page and the discovery marker.

The entry script must be a module:

```html
<script type="module" src="./game.js"></script>
```

Multiple module scripts on one page execute in document order, so an ordered
data-then-game pair remains valid.

---

# 13. JavaScript Architecture

Game JavaScript should generally follow:

```text
Input
  ↓
Game State
  ↓
Rules / Simulation
  ↓
Render
  ↓
User Input
```

Keep game state explicit.

Avoid scattering game state across:

* DOM attributes
* Global variables
* CSS classes
* Unrelated modules

Where practical, separate:

* State
* Rules
* Rendering
* Input
* Game lifecycle

The exact separation depends on the game.

---

# 14. Game Lifecycle

Games should have a clear lifecycle.

Typical lifecycle:

```text
initialize
   ↓
start
   ↓
playing
   ↓
game over / solved
   ↓
restart
   ↓
playing
```

A restart should produce a clean game state.

Avoid requiring a page reload to restart a game.

---

# 15. Input Architecture

Games should support the appropriate input methods for their mechanic.

Where applicable, test:

* Mouse
* Touch
* Pointer events
* Keyboard
* Trackpad
* Mobile viewport interaction

Prefer Pointer Events for interactions that need to work across mouse and touch.

Do not assume hover exists on mobile.

Touch targets must remain usable on small screens.

---

# 16. CSS Architecture

Shared CSS should contain only site-wide concerns.

Example:

```text
shared/css/
├── tokens.css
├── base.css
└── shell.css
```

Game-specific visual styling remains inside the game.

Example:

```text
src/honeycomb/style.css
src/doodle-on/style.css
src/untangle/style.css
```

A game's `<link rel="stylesheet">` is processed, minified, and content-hashed by
Vite automatically; no import statement is required.

Shared CSS is pulled in with an `@import` at the top of the game's own
stylesheet, never a second `<link>`. The shared rules must precede the game's
own so game-level overrides still win, and `@import` inlining makes that order
deterministic in both dev and build.

Avoid creating a global component library unless repeated requirements justify it.

The visual identity of individual games should remain flexible.

---

# 17. Design System

The site should share design principles rather than forcing every game into identical visual components.

The existing UI skills define the visual philosophy.

Relevant skills:

* `GAME-UI-PHILOSOPHY.md`
* `GAME-UI-REVIEW.md`
* `GAME-UI-REFINEMENT.md`

These should be consulted when designing or reviewing a game.

Architecture should not duplicate those documents.

---

# 18. PWA Architecture

Tap When Bored is an installable Progressive Web App.

The PWA is a **platform layer** on top of the MPA architecture.

It must not convert the site into an SPA.

The PWA consists primarily of:

```text
Web App Manifest
        +
Service Worker
        +
Application Icons
        +
Offline Cache
```

The PWA should provide:

* Installability
* App-like launch
* Offline access
* Offline gameplay for previously cached games
* Fast repeat visits
* Graceful handling of network failures

## Where the service worker comes from

The worker must be served from the site root (`/sw.js`) to hold root scope.

It is **generated, not copied from `public/`**: its precache list needs the
homepage's content-hashed filenames, which do not exist until the bundle has
been generated. The source lives at `scripts/sw-template.js` — outside `src/`,
so it is not a page, and outside `public/`, so it is not copied verbatim — and a
Vite plugin substitutes a build version plus the resolved precache list, then
emits the result to `/sw.js`.

The dev server deliberately serves a *different* worker: one that clears every
`twb-*` cache and unregisters itself. A caching worker in development serves
stale modules and fights HMR, which is a confusing failure worth designing out.

Because this is an MPA, the worker must not use a navigation fallback. Every
flat URL is a real document (§5); answering a navigation with a cached shell
would break both gameplay and SEO. A navigation that is offline and uncached is
an unvisited game, and gets a short page saying so rather than a broken one.

---

# 19. PWA Caching Strategy

Do not eagerly download every game when the PWA is installed.

Bad:

```text
Install PWA
 ↓
Download all 50 games
 ↓
Large cache
```

Preferred:

```text
Install PWA
 ↓
Cache application shell
 ↓
Open Honeycomb
 ↓
Cache Honeycomb assets
 ↓
Open Doodle
 ↓
Cache Doodle assets
```

This keeps installation lightweight.

The cache should generally contain:

### App shell

Cache-first.

### Previously visited game assets

Cache-first where appropriate.

### Network-dependent APIs

Network-first or graceful failure.

### Analytics

Must never block gameplay.

---

# 20. Offline Gameplay

Core gameplay should not depend on network connectivity.

A game should continue functioning when:

* Supabase is unavailable
* Analytics fails
* The user temporarily loses internet
* A network request times out

Network-dependent features should degrade gracefully.

For example:

```text
Score achieved
     ↓
Try leaderboard submission
     ↓
Success → continue
Failure → continue
```

Never:

```text
Leaderboard unavailable
       ↓
Game unavailable
```

---

# 21. PWA Update Strategy

Service-worker changes require deliberate versioning and testing.

When a new deployment is available:

```text
New build
   ↓
New service worker
   ↓
Browser detects update
   ↓
New assets become available
   ↓
Old cache is eventually removed
```

Cache invalidation must not leave the user with incompatible combinations of old and new assets.

Vite-generated hashed assets should be preferred for cache safety.

---

# 22. Bundle Architecture

Each game should produce an independent production dependency graph.

Example:

```text
Honeycomb
 ├── honeycomb.js
 ├── honeycomb.css
 └── honeycomb assets

Doodle
 ├── doodle.js
 ├── doodle.css
 └── doodle assets
```

The homepage must not import every game.

Avoid:

```js
import honeycomb from "./honeycomb";
import doodle from "./doodle-on";
import untangle from "./untangle";
```

The purpose of the MPA is to prevent this kind of bundling.

Each page is its own Rollup entry, so modules under `src/shared/` are split into
a shared chunk automatically. Do not set `manualChunks` or
`inlineDynamicImports`.

---

# 23. Bundle Budgets

Performance is a product requirement.

Initial warning budgets should be approximately:

| Resource            | Warning threshold |
| ------------------- | ----------------: |
| Compressed JS       |            ~50 KB |
| Compressed CSS      |            ~30 KB |
| Initial game assets |       ~100–150 KB |

These are guidelines rather than absolute limits.

A game exceeding the budget should trigger investigation.

Large assets or dependencies require justification.

Measure actual production output rather than relying on source-file size.

---

# 24. Dependency Management

Vanilla JS is the default.

Add a dependency only when it provides meaningful value that would be unreasonable to implement locally.

Dependencies should belong to the game that needs them.

For example:

```text
Honeycomb
  └── dependency A

Doodle
  └── no dependency

Untangle
  └── dependency B
```

Do not add a site-wide dependency simply because one game needs it.

Every dependency should be evaluated for:

* Bundle impact
* Runtime cost
* Maintenance
* Security
* Mobile performance
* Whether a small local implementation would be better

---

# 25. Asset Architecture

Prefer lightweight assets.

Preferred formats:

* SVG for simple graphics
* WebP for raster images
* Small local assets
* CSS shapes where appropriate

## Two asset tiers

**Tier 1 — `public/assets/`, stable URLs, never hashed.**
Anything a crawler or social network fetches by absolute URL: `og:image`,
`twitter:image`, JSON-LD `image`, homepage thumbnails. These URLs are already
indexed and cached by third parties and must never change (§5). Reference them
with an absolute path; a relative reference fails the build (§4).

**Tier 2 — `src/<slug>/assets/` and `src/assets/`, content-hashed.**
Gameplay assets referenced only from HTML, CSS, or JS. Vite hashes them and
rewrites the reference, so they can be cached immutably.

If an image appears in any absolute metadata URL, it is Tier 1.

Social platforms render SVG `og:image` poorly or not at all, so an OG image
should be a raster format even when the on-page artwork is a vector.

---

# 26. Network Architecture

The core game should require no network connection.

Optional network services may include:

* Supabase leaderboards
* Analytics
* Sharing
* Future cloud features

Network failures must not prevent the game from starting or continuing.

Use timeouts and graceful error handling where network requests are required.

---

# 27. Leaderboard Architecture

The leaderboard is deliberately minimal: **one global best score per game.**

No accounts, no per-player scores, no rankings, no history. One game keeps a
daily board (§ Data model), and that is the only scoping that exists.

## Responsibilities

Each game:

* Calculates its own score.
* Determines when a valid run has finished.
* Decides whether higher or lower represents a better result, and words the
  result for its own end card.
* Submits the score when appropriate.

The shared leaderboard service (`src/shared/ui/leaderboard.js`):

* Submits a candidate score for a game.
* Returns the current global best.
* Renders the global-best line's five states on a game's end card.
* Talks to Supabase.
* Absorbs its own failures without involving the game.

Games must not contain Supabase-specific or database-specific code.

## Score direction belongs to the game and the database, not the client service

The client service never compares scores. `submit_game_score()` reads the
game's direction from `game_config` and only ever moves the record the
improving way, so a page cannot claim "lower is better" for a game where it is
not, nor write into a day it is not playing.

So the service takes no `direction` flag. Adding one would be the first step
toward the generalized scoring framework this section rules out.

How a result is *phrased* is still the game's own call, which is why
`renderGlobalBest()` takes an `isRecord` predicate and the game's strings
rather than a direction:

```text
Direction that moves the record   →  game_config, server-side
Direction that picks the wording  →  the game's isRecord()
```

`src/data/games.js` also records `lowerIsBetter` and `daily` per game, so a
reader can see how a game is scored without opening the SQL. That copy decides
nothing — `npm run validate` parses the `game_config` seed in
`README-supabase.sql` and fails if the two disagree.

A game whose natural metric is completion time is free to treat lower as better.
Do not build a generalized scoring framework until multiple games actually
require it.

## One line, one renderer

Every game's end card carries a `#globalBest` element, and
`renderGlobalBest(el, {...})` is the only thing that writes to it. The line has
five states: hidden when no leaderboard is configured, a pending placeholder
while the request is out, "unavailable" when it fails, the record's value, or a
"new record" shout with the `new-global` class.

Those mechanics were once hand-written per game, and the copies drifted — one
game skipped the availability guard and announced "unavailable" on a normal end
card, another never showed a pending line, a third hid the line with a class
instead of the `hidden` attribute. Hence one renderer.

Visibility is the `hidden` attribute in every game. `scripts/validate-games.js`
fails the build if a leaderboard game has no `#globalBest`, or a game without a
leaderboard has one.

Styling is shared too, in `src/shared/css/leaderboard.css` (`.overlay-global`,
plus `.new-global` for the record state), which needs the game to define
`--accent-dark` and optionally `--record`. bubble-tap keeps its own rules for
this line, for the same reason it opts out of `tokens.css` and `shell.css`
(§16) — its end card is all-caps and monospaced and speaks `--ink`. It still
uses the shared *renderer*.

## Data model

One table holds the global best for every game, and a second says how each game
is scored. This is what `README-supabase.sql` creates:

```text
game_config                        game_scores
──────────────────────────────     ─────────────────────────────────
game_slug        PRIMARY KEY       game_slug  ─┐
lower_is_better                    period     ─┴ PRIMARY KEY
is_daily                           best_score
label                              updated_at

        submit_game_score(p_slug, p_score, p_day default null) returns int
          reads the game's row in game_config
          moves the record only in the improving direction
          returns the current best either way
```

`period` is `'all'`, or a `'YYYY-MM-DD'` day for a game whose
`is_daily` is true. It is always derived server-side.

Only word-steps is daily, because everyone gets the same puzzle that day, so
the race is like-for-like. An all-time "fewest steps" would just record the
easiest puzzle ever published and then never move. The client sends the local
date that chose the puzzle — the server's day is UTC and would otherwise file a
late-night score against a different puzzle — and the function clamps it to a
day either side of its own date, so it corrects the timezone without letting a
caller write anywhere it likes.

A game with no `game_config` row raises rather than silently creating one, so a
mis-wired slug is a loud error in dev and a missing line in production.

Row-level security is on, `insert`/`update`/`delete` are revoked from `anon`,
and the `security definer` RPC is the only write path.

This replaced a per-game shape (`global_score`, `honeycomb_global_best`, and an
RPC each). No game ever knew an RPC name, so that migration changed no game
code — and there is still exactly one `RPC` constant in the service.


## Supabase is a service, not a backend

Supabase provides the leaderboard and nothing else. It must not become an
application backend.

* No game requires it to start, run, or finish.
* No gameplay state, progress, or player data is stored in it.
* Local play, local best scores, and offline play are unaffected by its absence.
* A game with `leaderboard: false` never contacts it.
* Credentials reach the browser as `VITE_`-prefixed env vars (§35). The anon key
  is public by design; row-level security protects the data.

If Supabase is unavailable, the only visible effect is a missing global-best
line.

# 28. SEO and Metadata

SEO should be generated or maintained at build time.

Each game should have appropriate:

* Title
* Description
* Canonical URL
* Open Graph metadata
* Structured data where appropriate

The sitemap should be generated from the game registry.

Adding a game should not require manually editing the sitemap.

Runtime JavaScript should not be responsible for essential SEO metadata.

## SEO invariants

* Game URLs are flat and permanent (§5).
* Every page carries a self-referencing **absolute** canonical. Absolute is
  correct here — it also stops preview deployments competing for the same
  keywords.
* The trailing slash is canonical. `vercel.json` sets `"trailingSlash": true`,
  which covers every game automatically, so there is no per-game redirect table.
* `sitemap.xml` is emitted by a Vite plugin from `src/data/games.js` —
  `generateBundle` for the build, a dev middleware for the dev server. It is
  never a checked-in file and is never written into `public/`.
* `lastmod` comes from each registry entry's `updated` field, not the build
  date. Republishing unchanged `lastmod` values on every deploy devalues them.
* An `og:image` must be a raster format (§25).

---

# 29. Validation

A validation script should verify the repository before building.

Example checks:

```text
Game registry
    ↓
Every registered slug has src/<slug>/index.html
    ↓
Every src/ directory containing index.html is registered   ← both directions
    ↓
No slug is reserved (assets, static, icons, data, shared, api, _vercel)
    ↓
Slugs are unique
    ↓
registry.path === "/" + slug + "/"
    ↓
Page canonical === ORIGIN + registry.path
    ↓
Required files exist
    ↓
Metadata exists
    ↓
Referenced public/ assets exist on disk
```

The bidirectional registry-to-filesystem check is what makes adding game #50
safe: filesystem discovery means `vite.config.js` never needs editing, and this
check means the registry, homepage, and sitemap cannot silently fall behind.

Validation should fail the build when structural problems are detected.

Example:

```bash
npm run validate
```

---

# 30. Testing

Playwright is the only browser-level testing framework.

Tests assert **user-visible behaviour**, never implementation details.

Three layers:

```text
                    Tests
                      │
          ┌───────────┼───────────┐
          │           │           │
       Smoke     Game-specific   PWA
```

* **Smoke** — driven by `src/data/games.js`, so every registered game is covered
  automatically and the suite grows as games are added. Assertions that do not
  hold for every game are gated on registry capability flags such as
  `hasRestart` and `hasOverlay`, rather than assumed.
* **Game-specific** — core mechanic, win and loss conditions, restart. Only for
  games whose complexity earns it.
* **PWA** — manifest, icons, service-worker registration, and the
  visit-then-offline flow.

Suites run against both the dev server and the preview server, which serve
identical URLs (§5), so no spec needs environment-specific paths.

A failed validation or test blocks deployment (§31).

> **The testing methodology lives in `.claude/SKILLS/GAME-TESTING.md`** — what to
> cover per game, input simulation, randomized games, edge cases, brittleness
> rules, leaderboard and network-failure cases, responsive viewports, and which
> suites to run after which kind of change.
>
> That file is the single source of truth for testing practice. It is not
> restated here; this section defines only the architectural shape.

---

# 31. CI Pipeline

The production pipeline should be conceptually:

```text
Install dependencies
        ↓
Validate repository
        ↓
Production build
        ↓
Check bundles
        ↓
Run smoke tests
        ↓
Run game-specific tests
        ↓
Run PWA tests
        ↓
Deploy
```

A failed validation or test should block deployment.

`npm run build` runs validation itself, so a deployed build cannot skip it.

---

# 32. Development Commands

Recommended commands:

```bash
npm run dev            # Vite dev server on :5173, URLs identical to production
npm run build          # validate, then vite build -> dist/
npm run preview        # build, then serve dist/ on :4173

npm run validate

npm run test
npm run test:dev       # Playwright against :5173
npm run test:preview   # Playwright against :4173

npm run game:new <slug>
```

The exact commands may evolve, but the workflow should remain simple.

---

# 33. New Game Scaffolding

New games should be scaffolded through a script where practical.

Example:

```bash
npm run game:new honeycomb
```

The script should create:

```text
src/honeycomb/
├── index.html
├── game.js
└── style.css
```

It must also add the registry entry, or `npm run validate` will fail the next
build — which is the intended safety net (§29).

Manual duplication of boilerplate should decrease as the number of games grows.

---

# 34. Performance Monitoring

Performance should be treated as a regression risk.

Monitor:

* Production JS size
* Production CSS size
* Asset size
* Number of requests
* Initial page weight
* Runtime errors
* Game startup time

A new game should not silently introduce a large dependency or asset.

Performance regressions should be investigated before shipping.

---

# 35. Configuration and Secrets

Client configuration reaches the browser through Vite's env system.

```text
Vercel env vars  (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
        ↓
import.meta.env  (statically replaced at build time)
        ↓
src/shared/ui/leaderboard.js
        ↓
games that opt into the leaderboard
```

* Only `VITE_`-prefixed variables are exposed to client code.
* The Supabase anon key is public by design; row-level security protects the
  data (§27).
* Always write the full literal `import.meta.env.VITE_SUPABASE_URL`. A computed
  key such as ``import.meta.env[`VITE_${name}`]`` is **not** statically
  replaced: it works in dev and silently yields `undefined` in production.
* **A build must never mutate the working tree.** There is no generated
  `config.js` and no build command that writes source files.
* Local development uses `.env.local`, which is gitignored.

A missing variable must degrade to "leaderboard unavailable", never to a broken
game (§26).

---

# 36. Deployment

The application is deployed as a static site on Vercel.

The production build should contain:

* Homepage
* Individual game pages
* Static assets
* PWA manifest
* Service worker
* Icons
* Sitemap
* Metadata

There should be no requirement for a persistent application server for core gameplay.

Supabase remains an optional external backend for features such as leaderboards.

## Build contract

| Setting          | Value             |
| ---------------- | ----------------- |
| Build command    | `npm run build`   |
| Output directory | `dist`            |
| Node             | 22                |

`vercel.json` carries `buildCommand`, `outputDirectory`, `trailingSlash: true`,
and cache headers. It contains **no** per-game redirects or rewrites: Vercel
serves `dist/<slug>/index.html` at `/<slug>/` straight from the filesystem, and
`trailingSlash: true` supersedes the previous seven-row redirect table.

Cache headers:

* `/static/*` — Vite's content-hashed output — immutable, one year.
* `/assets/*` — stable-filename public assets — revalidating, one day.

---

# 37. AI-Assisted Development

The architecture is intentionally designed for AI-assisted development.

An AI agent working on one game should not need to understand the entire repository.

The normal context should be:

```text
CLAUDE.md
    +
relevant ARCHITECTURE.md sections
    +
relevant skill
    +
target game
    +
target tests
```

Avoid loading all games into context for a local change.

---

# 38. Skills

AI behaviour is separated into focused skill documents. These are the ones that
exist:

```text
.claude/SKILLS/
├── GAME-TESTING.md          how to test a game (§30)
├── GAME-UI-PHILOSOPHY.md    visual and interaction principles
├── GAME-UI-REVIEW.md        how to evaluate an interface
└── GAME-UI-REFINEMENT.md    how to improve an interface without changing the game
```

Responsibilities:

### Game Testing

Defines how to verify a game still works from the player's perspective after any
functional change. The single source of truth for testing practice (§30).

### UI Philosophy

Defines the visual and interaction principles.

### UI Review

Defines how to evaluate the interface.

### UI Refinement

Defines how to improve an existing interface without unnecessarily changing its
underlying game.

Add a skill only when a real, repeated workflow needs one. Do not document
skills that do not exist.

---

# 39. Architecture Change Process

Architecture should evolve deliberately.

Before introducing a major architectural change, evaluate:

1. What concrete problem does it solve?
2. How many games benefit?
3. Does it increase runtime complexity?
4. Does it increase bundle size?
5. Does it make AI development easier or harder?
6. Does it weaken game isolation?
7. Does it affect PWA caching?
8. Does it increase testing complexity?
9. Can the problem be solved locally instead?

Prefer the smallest architectural change that solves the actual problem.

---

# 40. Scaling Model

The architecture should scale primarily by adding independent game modules.

```text
Game 1 ──┐
Game 2 ──┤
Game 3 ──┤
Game 4 ──┤── shared infrastructure
Game 5 ──┤
...      │
Game 50 ─┘
```

The number of games should not cause:

* A giant JavaScript bundle
* A giant runtime
* A giant shared game engine
* A giant application state
* A giant homepage dependency graph

The repository can grow substantially while individual games remain small.

---

# 41. What This Architecture Explicitly Avoids

Do not introduce these without a strong architectural reason:

* SPA architecture
* Client-side routing
* React/Vue/etc. for game runtime
* Universal game engine
* Global game state
* One bundle containing all games
* Heavy UI framework
* Large global component library
* Mandatory backend
* Network-dependent gameplay
* Eager caching of all games
* Runtime-generated SEO
* Excessive abstraction
* Shared game-specific logic
* Changing a live game URL
* A `/games/` URL prefix, or any path restructuring
* Redirects or rewrites used to reshape game URLs
* Environment-specific URL mapping
* Non-module `<script src>` in a page
* A build step that writes into the source tree
* Treating Supabase as a required backend
* A `main.js` that only imports `game.js`

---

# 42. Final Architectural Principle

Tap When Bored should remain:

> **A collection of tiny, independent games wrapped in a lightweight shared platform.**

The platform provides:

```text
Build
Deployment
PWA
Theme
Shell
Metadata
Registry
Validation
Testing
Performance
```

The games provide:

```text
Mechanics
State
Rules
Rendering
Input
Scoring
Replayability
```

The boundary between the two should remain clear.

When adding a new feature, prefer improving the platform only when multiple games genuinely need it.

When building a new game, prefer keeping the implementation inside the game.

The goal is not architectural uniformity.

The goal is to make **every individual game fast, simple, testable, and easy to build.**
