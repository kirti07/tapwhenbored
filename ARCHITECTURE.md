# Tap When Bored — Architecture

# 1. Purpose

Tap When Bored is a collection of lightweight, single-player browser games designed for fast loading, immediate play, simple interaction, and high replayability.

The architecture is optimized for:

* Many independent games
* Very small initial payloads
* Fast page loads
* Mobile and desktop play
* Installable PWA experience
* Independent game development
* AI-assisted development
* Automated functional testing
* Simple deployment
* Minimal shared runtime complexity

The system should make adding game #50 nearly as straightforward as adding game
#5. Concretely: adding a game means creating `src/<slug>/` and one registry
entry. It must never require editing the build configuration, the sitemap, or
`vercel.json`.

This holds for **games**. A non-game page is recognised by path in one build
plugin, so a third one would need a build-config edit (§10) — which is a reason
to keep the set of non-game pages small, not a reason to relax the rule.

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
| PWA                    | Web App Manifest + icons          |
| Offline gameplay       | No — installable, not offline     |
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
| Offline model          | None — nothing is cached (§19)    |

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

## The plugins in `vite.config.js`, and what each is for

The build is plain Vite plus a handful of small local plugins. None of them is a
framework; each removes something that was previously hand-copied into every
page. They are listed here because several are invisible in the source HTML —
a page carries a comment marker and gets real markup at build time — and a
reader who does not know that will look for the missing content in vain.

| Plugin | What it does |
| --- | --- |
| `trailingSlashParity()` | Dev/preview middleware redirecting `/foo` to `/foo/`, so local URLs match production exactly (§5). |
| `themeBootstrap()` | Inlines `scripts/theme-bootstrap.js` at the `<!-- theme-bootstrap -->` marker. Runs `"pre"` so Vite still sees a plain `<head>` when it injects preloads. |
| `sharedMarkup()` | Substitutes `scripts/sprite.svg` and `scripts/theme-button.html` at their markers (§9). |
| `homepageFromRegistry()` | Emits the shelf, the high-score roll, the player-card rows, the cabinet tabs and the JSON-LD from the registry, at build time (§28). This is the plugin a visual change touches most. |
| `vercelInsights()` | Adds the Vercel Analytics tag, which only exists on Vercel's edge. |
| `googleAnalytics()` | Inlines `scripts/gtag.js` at the end of every page's `<head>` (§19). |
| `sitemap()` | Emits `sitemap.xml` from the registry; a dev middleware and a build emit (§28). |
| `pwa()` | Injects the manifest and icon links, and inlines the worker-cleanup snippet (§18, §19). |
| `warnMissingLeaderboardEnv()` | Warns when Supabase credentials are absent, and **fails the build** if a secret-looking variable is present (§35). |

Two rules about them. A marker-based plugin replaces an exact string including
its indentation, so a reflowed template silently stops being substituted — if
generated markup vanishes, suspect the whitespace before the marker. And none of
them may write into the source tree (§35).

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
| A build plugin hoisting output out of `games/` | Dev and preview would still serve `/games/<slug>/`; only production would be flat, and the build manifest would disagree with real URLs |
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
│   │       ├── leaderboard.js
│   │       ├── prefs.js      namespaced localStorage, try/catch inside
│   │       ├── audio.js      one tone() + the site-wide mute
│   │       ├── theme.js      the in-game theme toggle
│   │       ├── shell.js      initHowto, initShare, createNote, bindOverlay
│   │       ├── player.js     the player's name, on this device only
│   │       ├── progress.js   what this browser played today
│   │       ├── day.js        localDay() — the player's date, not UTC
│   │       └── format.js     one spelling for a score and a timestamp
│   │                         §9 lists what else is *allowed* to live here.
│   │                         Every one of these replaced eight hand-maintained
│   │                         copies; none of them holds game rules.
│   │
│   ├── account/              →  /account/ the player card
│   │   ├── index.html                     noindex: it is personal, not content
│   │   └── account.js
│   │
│   ├── wall/                 →  /wall/    the boards
│   │   ├── index.html                     indexed: this is public content
│   │   └── wall.js
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

`sitemap.xml` is deliberately absent from `public/` — it is emitted by a Vite
plugin from the registry (§28), so it cannot drift. `sw.js` *is* in `public/`,
because it is no longer generated from anything: it is a fixed tombstone that
removes the caching worker this site used to ship (§19).

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

## What is actually shared, and why each one earned it

| Module | Replaced | Why it is shared, not copied |
| --- | --- | --- |
| `ui/leaderboard.js` | — | Score direction lives in the database; the client never compares scores (§27). |
| `ui/prefs.js` | 3 naming conventions, 7 hand-written try/catch pairs, 1 missing one | `localStorage` *throws* in Safari private mode. It is not enough for most callers to remember — the one that forgets takes the page down. |
| `ui/audio.js` | 7 copies of `tone()` in 4 drifted signatures, and 7 of the mute-button wiring | Only 3 of 8 games resumed a suspended `AudioContext`, so in the other 5 a tab switch killed audio for the session. The mute is one preference for the whole site. |
| `ui/theme.js` | nothing — the games had no toggle | Landing on a shared link and having to leave the game to change theme. The *initial* theme stays in the inlined bootstrap, which is the only thing that can beat first paint. |
| `ui/shell.js` | 8 copies each of the how-to sheet and the overlay, 7 of the share flow | The end card was never a dialog in any game. Done per game that is eight edits and drifts within a month — and it had: three games swallowed a failed clipboard write silently, telling the player nothing. |
| `ui/player.js` | — | The player's name is one label across the whole site, and it is a label, not an identity: stored in this browser, never verified. |
| `ui/progress.js` | — | "What did this browser play today" is asked by the homepage, the player card and every end card, and the answer must agree in all three. |
| `ui/day.js` | a date computed two ways | A daily puzzle is chosen by the *player's* date and the server runs in UTC. One function, so a page cannot disagree with the score it submits (§27). |
| `ui/format.js` | 8 spellings of a score | `31 moves`, `1:04` and a relative timestamp are platform copy, not game rules, and drifted per game. |

Two things that are *markup* rather than code are shared the same way, but
through the build instead of a module: `scripts/sprite.svg` (the sticker
`<symbol>` definitions) and `scripts/theme-button.html` (the light/dark toggle).
Both were hand-copied — the sprite into two documents at 50 identical lines
each, the button into eleven, where it had already drifted into three variants
and the games' copy had lost its `aria-hidden`. They are substituted into the
HTML by `sharedMarkup()` in `vite.config.js`, so they cost no runtime bytes and
cannot drift again.

`shell.js` is held at four small functions on purpose — `initHowto`,
`initShare`, `createNote` and `bindOverlay`, and no fifth without a fight. The pull is to grow it
into a game engine with a lifecycle and a spreading options object; if it needs
to know a game's rules, the change belongs in the game.

`bindOverlay()` watches the class a game already toggles rather than asking
every game to adopt a new API, which is what keeps each game's diff to one
import and one call.

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
    tagline: "Tap · Reshape",       // the homepage card's second line
    description: "...",
    path: "/honeycomb/",            // flat (§5) — must equal "/" + slug + "/"
    ogImage: "/assets/honeycomb-og.jpg",
    accent: "#8b6fd9",              // the homepage card's colour, light
    accentDark: "#b48cff",          //   and dark; both inlined as custom props
    sticker: "st-honey",            // a <symbol> in the sprite in src/index.html
    scoreUnit: "time",              // what this game's number counts
    scoreFormat: "time",            //   "time" = milliseconds, "int" = a count
    darkThemeColor: "#14101f",      // must match this game's dark --bg
    updated: "2026-08-24",          // sitemap lastmod; bump on real change only
    changefreq: "monthly",          // sitemap changefreq
    hasRestart: false,              // restarts via the overlay, not a topbar button
    hasOverlay: true,
    leaderboard: {                  // or false ⇒ never contacts Supabase
      lowerIsBetter: true,          //   checked against game_config (§27)
      daily: false
    }
  }
];

// Pages that are neither the homepage nor a game.
export const pages = [
  { slug: "account", title: "Your player card", path: "/account/", ... },
];

// The homepage is not a game, but it has metadata of its own.
export const home = {
  path: "/",
  ogImage: "/assets/tapwhenbored-og.jpg",   // the site's card, not a game's
  updated: "2026-09-03",
  changefreq: "monthly",
  priority: "1.0",
};
```

Every field here has a consumer. A field nothing reads is worse than no field:
it looks like a contract, and it drifts. `category` was one — validated,
scaffolded into every new game, and read by nothing — and it was removed rather
than wired up, because nothing on the site groups games by category.

Three fields went the same way when the homepage moved to the sticker design.
`thumb` and `thumbAlt` named per-game artwork the shelf no longer draws — the
cards use a tinted glyph from one inline sprite instead, so the homepage now
requests no images at all. `cardClass` named a CSS modifier whose sixteen
`.card--<slug>` rules nothing validated: a new game whose pair was forgotten
shipped in the fallback purple, silently. Colour is data now, and
`scripts/validate-games.js` fails the build on a malformed accent or a `sticker`
with no matching `<symbol>`.

`scoreUnit` and `scoreFormat` sit on the game rather than inside `leaderboard`
on purpose. A score's unit is a property of the game, not of whether anyone else
can see the number — untangle keeps a local best and has no public board, and
its "31 moves" is no less a score for that.

`accent` and `accentDark` are the game's colour anywhere the *platform* draws
it: the build inlines them as custom properties on every element it emits, so a
card, a wall row, a sticker slot and a cabinet marquee all take their colour
from the registry and none of them needs a CSS rule per game. That is what
replaced the sixteen `.card--<slug>` rules described above, and it is why a new
game needs no stylesheet edit to look like itself.

Mind the two similarly-named things. On platform-drawn elements the pair is
`--accent` and `--accent-d`, meaning this game's colour in light and in dark.
Inside a game's own stylesheet, `--accent-dark` is something else entirely — a
darker shade of that game's light accent, used for text on pale surfaces. They
are not interchangeable, and the near-identical names are a trap worth knowing
before editing either.

## Registry constraints

`src/data/games.js` is loaded **both** by the browser and by Node
(`vite.config.js`, `scripts/*.js`), so it must be portable ESM:

* No `import.meta.glob`, no CSS or image imports, no `process.env`.
* Image references are plain absolute strings, not imports.

`slug` must equal the directory name under `src/`, and `path` must equal
`/<slug>/`. Validation enforces both (§29).

Reserved slugs, which would collide with build output, a `public/` directory or
a platform path: `assets`, `static`, `icons`, `data`, `shared`, `api`,
`_vercel`, `fonts`, plus the slug of every non-game page — `account` and
`wall`, and `book`, which stays reserved because that page was retired after
its URL had been indexed.
`scripts/validate-games.js` holds the list; a new non-game page must be added to
it, or a future game could claim the same URL.

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

## Pages that are not games

`account` and `wall` are real pages with real URLs, and the registry's `pages`
array is what makes them visible to everything that is registry-driven — the
sitemap, validation, the bundle check and the accessibility suite. A directory
under `src/` with an `index.html` that appears in neither `games` nor `pages`
fails `npm run validate`, which gates the deploy.

```text
/wall/    the boards. Public content, indexed, changes whenever a record does.
/account/ the player card. Personal, `noindex, follow`, and mostly local data.
```

Their field contract is smaller than a game's: `slug`, `title`, `path`,
`updated`, `changefreq` and `priority`. They have no `accent`, no `sticker`, no
`ogImage` and no `leaderboard`, because nothing draws a card for them.

Both are built from the registry the same way a game's card is — `cabinetTab()`
and `accountRow()` in `homepageFromRegistry()` emit their rows at build time, so
a new game appears on both pages without either page being edited.

One consequence, and the exception to §1's rule that a new page needs no build
config: that plugin recognises these pages **by path**. Adding a *third*
non-game page therefore does mean editing `vite.config.js`, unlike adding a
game. Prefer re-skinning one of these two over adding a third.

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
├── tokens.css        the display webfonts, and nothing else
├── base.css          the reset, and document-level behaviour
├── shell.css         the top bar a game wears
├── howto.css         the how-to bottom sheet
└── leaderboard.css   the global-best line
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

## Shared CSS owns no colour, and the arcade layer is namespaced

`tokens.css` declares the webfonts and `--font-display`. It sets **no colour at
all**, and must not:

> A game's palette is part of its identity and lives in its own `style.css`.
> The token *names* agree across games; the *values* deliberately differ. A
> shared colour would either be overridden everywhere, which is pointless, or
> flatten a game's look, which is harmful.

Every game declares its own `:root { --bg, --ink, --ink-soft, --line, --accent,
--accent-dark }` and its own `:root[data-theme="dark"]` override, and the shared
files consume those names without ever defining them — `shell.css` needs
`--ink`, `--ink-soft` and `--line`; `howto.css` needs `--bg`, `--ink`,
`--ink-soft`, `--accent` and `--accent-dark`; `leaderboard.css` needs
`--accent-dark` and optionally `--record`.

The cabinet chrome is the one shared thing that will need a palette of its own —
a marquee, a dark screen panel, medals — and it wants the same obvious names. So
when it lands it takes its own, prefixed: `--arc-bg`, `--arc-card`, `--arc-ink`,
`--arc-line`, `--arc-screen`, `--arc-screen-ink` and so on, in a
`shared/css/arcade.css` consumed only by the chrome, the board and the end card.
A game's `--bg` keeps meaning what it means today.

That file does not exist yet; this rule is written down first so the layer is
built namespaced rather than retrofitted.

`--accent` is the deliberate exception, because it is already the shared name:
the registry's `accent` / `accentDark` are inlined as custom properties by the
build (§10), and a cabinet's marquee is that colour. One variable crosses the
line; a palette does not.

`--arc-screen` is dark in **both** themes on purpose. A cabinet screen is dark
whatever the room is lit like, which is why it is a separate token family rather
than a themed surface — and why the light theme carries one large dark panel.

## Viewport height is spelled `svh`, everywhere

A game fills the viewport and is not meant to scroll, so it must be sized
against the *smallest* the viewport ever gets:

```css
html, body { height: 100svh; }   /* not vh, not dvh */
```

and every length inside — paddings, gaps, board dimensions, `clamp()` bounds —
uses `svh` too. Mixing them is the bug this rule exists to prevent: sizing
`html`/`body` in `dvh` while the contents used a bare `vh` (which means `lvh`,
the chrome-*hidden* height) laid the contents out against a viewport up to 20%
taller than their own container, and the difference became real overflow. On a
document that stays scrollable by design (see `shared/css/base.css`) that
overflow is what let a game open from a shared link with its top bar above the
top of the screen.

`svh` also does not change when the URL bar collapses, so a game never
re-lays-out mid-gesture. The cost is a strip of page background below the game
once the browser chrome hides, which for a page that does not scroll is the
right trade.

Code that needs the true current height for something other than layout should
ask JS, not CSS.

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

## The one shared visual component, and its boundary

§16 says to avoid a global component library "unless repeated requirements
justify it". The cabinet shell is the first deliberate use of that clause: eight
games presented as eight machines is a repeated requirement, and eight copies of
a marquee would drift the way the how-to sheet and the global-best line drifted
before them.

The boundary is what keeps this from becoming the universal component library
§41 rules out:

```text
shared      the top bar, the cabinet frame, the board panel, the end card
a game's    the playfield, and every colour in it
```

A game's board, tiles, marbles and bubbles are its own. The platform frames
them; it does not paint them.

---

# 18. PWA Architecture

Tap When Bored is an **installable** Progressive Web App. It is not an offline
one.

The PWA is a **platform layer** on top of the MPA architecture.

It must not convert the site into an SPA.

The PWA consists of:

```text
Web App Manifest
        +
Application Icons
```

That is all of it. There is no service worker and no cache — §19.

The PWA should provide:

* Installability
* App-like launch
* Graceful handling of network failures

Installability does not need a worker: Chrome dropped the registered-worker
requirement in 108 on mobile and 112 on desktop, so an install still gets its
own window, icon and splash screen. It does not get an offline copy.

The manifest and apple-touch-icon links are injected into every page by `pwa()`
in `vite.config.js`, which is also what inlines the cleanup snippet §19
describes. Nothing else is generated for the PWA.

---

# 19. Caching and Offline Mode

**There is none.** Nothing is cached by the application — not in a browser tab,
not in the installed app — and no page is available without the network.

This was removed deliberately. The site shipped a service worker that precached
the app shell and cached each game as it was opened. It worked, and it cost a
worker lifecycle, a two-cache invalidation scheme, an update-announcement
protocol between worker and page, and a standing risk of serving a stale build —
for games that load in a few kB over any working connection. Offline is a
feature to add back on purpose, not one to keep running by inertia.

What follows from that:

* **A page load is a page load.** Every document and every asset comes from the
  network, subject only to HTTP cache headers (§36). Nothing in the browser
  answers a navigation on the site's behalf.
* **A deploy is live on the next navigation.** There is no cache to invalidate
  and no worker to update, which is why §21 is now a paragraph rather than a
  protocol.
* **Offline is the browser's own failure page.** There is no "not available
  offline" document, because nothing pretends to hold a copy.
* **Gameplay still must not depend on the network** once a page is open (§20).
  That is a property of the game code, not of a cache.

### Removing the worker from devices that already have one

Shipping no worker is not enough by itself. A device that visited while there
was one still has it registered, and an active worker keeps answering out of its
caches — so it would go on serving an old build for as long as the player keeps
the app installed. Two things remove it.

**`public/sw.js` — the tombstone.** Ten lines at the URL the old worker lived
at: `skipWaiting`, then drop every `twb-*` cache, claim the pages the old worker
was serving, and `unregister()`. It has no fetch handler, so the moment it
activates nothing on the origin is answered from a cache — including the page
that is already open, which is why this beats simply deleting the file.

Claim comes *before* unregister: claim is what takes the open pages away from
the old worker, and once the registration is gone there is nothing left to claim
with.

```text
navigation   the old worker still answers this one from cache
             the update check fetches /sw.js, finds a byte-different script
install      skipWaiting
activate     twb-* caches deleted, open pages claimed, registration removed
             → every request from here on goes to the network
```

Serving a 404 instead also removes the registration in Chromium, but it leaves
the caches behind and other engines need not do it at all. It is deliberately
kept as a real script, and it must stay deployed for as long as any device might
still carry the old worker.

Measured against a real installed app window carrying the previous build's
worker and caches: both caches and the registration were gone within about two
seconds of the launch, and the next navigation in that same session already came
from the network. Only the first paint of the first launch is the old build.

**`scripts/sw-cleanup.js` — the page-side half.** Inlined into every page; on
every load it unregisters every registration for the origin and deletes every
`twb-*` cache. Idempotent, silent, and gated on nothing. It covers what the
tombstone cannot reach: a registration that has already gone while its caches
stayed behind, anything done by hand in DevTools, and the state of the world
after the tombstone is eventually deleted.

Both are temporary in principle. Once no device in the field can still be
carrying a worker, `public/sw.js` and the snippet with its injection can go.

### The fold rule, and why it is gone

There used to be an `EAGER_CARDS` bound in `vite.config.js`: a fixed four shelf
cards fetched eagerly whether the catalogue held seven games or fifty, with
everything below `loading="lazy"` and a smoke test asserting both directions.
It first existed to bound the precache and stayed on as a first-paint bound.

It has been deleted along with the images it scheduled. The shelf now draws
each game as a glyph from a single inlined SVG sprite, so the homepage requests
no images at all and there is nothing left to schedule — the launch cost cannot
grow with the shelf because the shelf costs nothing to fetch. Adding game #50
adds a `<symbol>` and one card of markup.

### Network-dependent APIs

Network-first or graceful failure.

### Analytics

Must never block gameplay.

There are two tags, both injected from `vite.config.js` so no page carries
either in its source. `vercelInsights()` adds Vercel Analytics, which is
cookieless and served from Vercel's edge — so it 404s in dev and preview, which
is why `tests/smoke/site.spec.js` allowlists it. `googleAnalytics()` inlines
`scripts/gtag.js`, the GA4 tag for `G-NPERHK4GNM`.

GA4 loads its library **only when the hostname contains `tapwhenbored.com`**.
That excludes dev, `vite preview`, Playwright and `*.vercel.app` preview
deploys, and it is not a nicety: the browser tests run against a real production
build on `localhost:4173` across two device projects, so an unguarded tag would
report every CI run as real traffic, and the smoke suite — which fails on any
subresource that does not load — would go red on a machine with no network. The
guard is why neither spec needed an allowlist entry for Google.

`window.dataLayer` and `window.gtag` are defined on every page in every
environment; only the library and the `config` call are gated. So
`gtag("event", ...)` is safe to call from anywhere, including locally, where it
queues and goes nowhere.

Neither tag is measured by `check:bundles`, which follows only same-origin
`/static/*` references (§23).

---

# 20. Network-Independent Gameplay

Core gameplay should not depend on network connectivity **once the page is
open**. Loading the page needs the network (§19); everything after that must
not.

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

There is nothing to update.

With no service worker, a deploy is live on the next navigation: the document
comes from the network, and the `/static/` files it names are content-hashed, so
a page can never pair a new document with stale code.

This section used to describe a worker lifecycle — precache the new shell, drop
the older ones, claim the open pages, announce the new build, and reload the
shelf but only if the player had not touched it yet, and never a game in play.
All of it went with the worker (§19). Reintroducing caching means reintroducing
that protocol, which is most of what the trade actually costs.

The one moving part left is the cleanup snippet in §19, which removes a worker
installed by an older build.

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

## How they are measured

`npm run check:bundles` (`scripts/check-bundles.js`) is what checks this. It
reads the **built** `dist/**/index.html` for every entry in `[home, ...pages,
...games]`, follows each `/static/*` reference one level, gzips it, and sums JS
against CSS. So the budgets are **per page and gzipped**, and a shared chunk is
counted against every page that names it — which is the number that matters,
because a visitor pays per page, not per repo.

It warns rather than fails unless given `--strict`, and a page it cannot find
counts as a breach. It needs `dist/`, so it runs after a build; §31 puts it
between Build and Smoke.

The third row above is *not* measured: no asset, font or document weight is
counted, only JS and CSS. Judge that row by hand.

Actual weights are nowhere near the ceiling — the heaviest page is `/honeycomb/`
at about 9.6 kB JS and 4.0 kB CSS. That headroom is the budget's whole purpose:
it is there to be spent deliberately, not admired.

## What the cabinet chrome is allowed to cost

* The pixel display face, latin subset, two weights: **about 7 kB**, and only
  for marquees, page headings, eyebrows, medals, chips and the one big result
  number. Never body copy, never below 8.5 px, and with the body face as its
  fallback so a failed load degrades to the site's own display font.
* Body copy keeps the existing face. Numbers use the system monospace stack with
  `font-variant-numeric: tabular-nums`. **No third webfont.**
* No images and no icon font. The chrome's glyphs are inline SVG of a few
  hundred bytes each, and the homepage must go on requesting **no images at
  all** (§19, §25).
* The marquee bulbs, the screen's scanlines, the medals, the highlighted row,
  the celebration and both tab strips' selected states are **CSS only, zero
  JS**. A decorative effect that needs a script does not earn its place.

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
`twitter:image`, JSON-LD `image`. These URLs are already indexed and cached by
third parties and must never change (§5). Reference them with an absolute path;
a relative reference fails the build (§4).

The homepage's thumbnails used to live here too. They are gone: the shelf draws
each game as a glyph from one sprite inlined in `src/index.html`, so the
homepage requests no images at all. The `og:` images are untouched — those are
fetched by other people's servers and are the reason this tier exists.

**Tier 2 — `src/<slug>/assets/` and `src/assets/`, content-hashed.**
Gameplay assets referenced only from HTML, CSS, or JS. Vite hashes them and
rewrites the reference, so they can be cached immutably.

If an image appears in any absolute metadata URL, it is Tier 1.

Social platforms render SVG `og:image` poorly or not at all, so an OG image
should be a raster format even when the on-page artwork is a vector.

The homepage needs its own OG image, not a game's. Borrowing one means sharing
the site previews as a single game — `home.ogImage` in the registry exists so
that it is validated (§29) rather than left to drift. It is also the one page
whose card is `summary_large_image`; the games' images are 640² squares, where
`summary` is correct.

Changing the *picture* in an OG image means a **new filename**. Social networks
cache previews keyed on the URL and will keep serving the old picture
indefinitely, on top of the 24-hour CDN TTL `vercel.json` gives `/assets/*`.

Re-encoding the same picture is the exception, and overwrites in place. A stale
cached preview is then still the *correct* preview, so there is nothing to bust
— and renaming would cost a registry field, two meta tags, and a dead file kept
around forever for already-shared links. This is how `marble-nostalgia-og.jpg`
went from 150 kB to 61 kB, in line with its peers at the same 640².

## Fonts are local

`public/fonts/` holds the display webfonts, subset to latin, one file per weight
and family, alongside their licences. Nothing is loaded from a font CDN.

The `@font-face` rules live in `src/shared/css/tokens.css` — that file and the
licences are the whole font system, and a theme change touches it there.

This is a first-paint decision, not a privacy or licensing one. A cross-origin
stylesheet in the `<head>` blocks rendering until it arrives, so a launch paid a
DNS lookup, a TLS handshake and a round trip to a third party before it could
paint its own title. Same-origin files ride the connection the document already
opened.

Each face is declared `font-display: swap` with an explicit `unicode-range`, so
text paints in the fallback immediately and the browser fetches nothing for
glyphs the subset does not cover.

The same reasoning is why the fonts are subset, and why a page preloads only the
weights it actually renders. `bubble-tap` is deliberately system-font and loads
none. Weight 700 is the one nearly every page paints its title in; weight 800 is
loaded by honeycomb alone, because exactly one rule in the site renders it.

A preloaded face is fetched at the browser's highest priority, ahead of the
things the page paints with, so preloading an unused weight is not a harmless
extra — it is the better part of 20 kB of the critical path spent on nothing
(`tokens.css` records the exact per-file sizes; trust that file over this
paragraph). Every page but honeycomb shipped the 800 face that way for a while.
`tests/smoke/site.spec.js` now pins each page's preloads to the weights its own
stylesheet renders. Beware when auditing this by hand: a rule can declare
`font-weight: 800` and mean the *system* font, which consumes nothing from
`public/fonts/`.

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

The leaderboard is a **board per game per period**: ten named rows, plus
wherever the player happens to be. Names and email addresses are optional and a
player is a UUID their own browser made up.

This replaced a deliberately minimal shape — one global best score per game, no
players, no rankings — which the site outgrew when the boards became the reward
rather than a footnote. What that shape got right is kept below: the direction a
score improves in still lives in the database, and a game still plays perfectly
with the leaderboard unreachable.

## Responsibilities

Each game:

* Calculates its own score.
* Determines when a valid run has finished.
* Decides whether higher or lower represents a better result, and words the
  result for its own end card.
* Submits the score when appropriate.

The shared leaderboard service (`src/shared/ui/leaderboard.js`):

* Submits a finished run for a game.
* Returns the current board, the player's standing, and the global best.
* Renders the global-best line's states on a game's end card.
* Talks to Supabase.
* Absorbs its own failures without involving the game.

Games must not contain Supabase-specific or database-specific code.

## Score direction belongs to the game and the database, not the client service

The client service never compares scores. The write function reads the game's
direction from `game_config` and only ever moves a row the improving way, so a
page cannot claim "lower is better" for a game where it is not, nor write into a
day it is not playing.

So the service takes no `direction` flag. Adding one would be the first step
toward the generalized scoring framework this section rules out.

How a result is *phrased* is still the game's own call, which is why
`renderGlobalBest()` takes an `isRecord` predicate and the game's strings
rather than a direction:

```text
Direction that moves a row        →  game_config, server-side
Direction that picks the wording  →  the game's isRecord()
```

`src/data/games.js` also records `lowerIsBetter` and `daily` per game, so a
reader can see how a game is scored without opening the SQL. That copy decides
nothing — `npm run validate` parses the `game_config` seed in
`README-supabase.sql` and fails if the two disagree.

A game whose natural metric is completion time is free to treat lower as better.
Do not build a generalized scoring framework until multiple games actually
require it.

## Identity is a UUID, optional, and unverified

A player is a `player_id` the browser generates for itself and keeps in
`localStorage`, alongside a second UUID, the `write_token`. There is no account,
no password, no email login and no sign-in. Every board says so out loud:
"scores aren't verified".

* **The name is optional, and it is not unique.** Up to 24 characters,
  mixed case, nullable — the score row is written before the name exists,
  because the end card shows your row already ranked with a cursor blinking in
  the name column. Uniqueness was considered and rejected: "name taken" would
  land at the exact moment a player first cared about the board. What *is*
  unique is the `player_id`, and one `run_id` per finished run.
* **The email is optional and write-only.** It exists for one promise — telling
  a player when they lose a top-ten slot — and nothing sends mail yet.
* **`player_id` is public** (it is on every board row), so it cannot also be
  the thing that authorises a rename. That is the `write_token`: required by
  `save_player()` and `delete_player()`, never required to submit a score. A
  forged submission is a scores-aren't-verified problem; a forged rename would
  be somebody else's name.

## Bests and streaks are local, and must stay local

The server is authoritative for **one thing: ranks and boards.**

A player's personal best, their per-game run counts, when they last played, and
the Word Steps streak are held in this browser and never uploaded. That is a
product decision, not an omission — it is why the player card can show a best
for Untangle and Doodle On, which have no board at all, and why its error state
reads "your bests are stored on this device and are fine, we just couldn't fetch
the ranks".

So there is no `player_games` table, no per-player history and no streak table,
and adding one is not a small change but a reversal. `ui/progress.js` and
`ui/player.js` are where this lives.

## Data model

Five tables. This is what `README-supabase.sql` creates:

```text
game_config                       players
─────────────────────────────     ──────────────────────────────
game_slug       PRIMARY KEY       player_id        PRIMARY KEY   public
lower_is_better                   write_token                    private
is_daily                          name  (nullable, not unique)   public
label                             email (nullable)               private
min_score, max_score              notify_displaced, notify_streak, tz
                                  blocked, created_at

game_leaders  (the boards)        game_scores  (the game-wide record)
─────────────────────────────     ──────────────────────────────
game_slug    ─┐                   game_slug  ─┐
period_kind  ─┤ PRIMARY KEY       period     ─┴ PRIMARY KEY
period_key   ─┤                   best_score
player_id    ─┘                   updated_at
best_score                        player_id
achieved_at

submit_limits                     submitted_runs
─────────────────────────────     ──────────────────────────────
bucket  PRIMARY KEY               run_id  PRIMARY KEY
window_start, hits                created_at
```

`period_kind` is `'day'`, `'week'` or `'all'`, for **every** game.
`period_key` is `'YYYY-MM-DD'`, an ISO `'IYYY-Www'`, or `'all'`, and is always
derived server-side by `period_keys()`. Weeks start Monday, because ISO weeks
do.

`is_daily` no longer selects a period. It now records only that everyone plays
the same puzzle that day — which is what makes word-steps' day board
like-for-like — and it decides whether `game_scores` gets a *second*, day-keyed
row for that game alongside the `'all'` one every game has.

### One row per player per board, not one per run

`game_leaders` is keyed on the player, so a player occupies exactly one slot on
each board however many times they play. This is the load-bearing decision in
the schema:

* A board reads correctly — nobody appears in the top ten five times.
* "Ties are broken by whoever posted first" is a property of the surviving row,
  ordered by `(best_score, achieved_at)`.
* The table grows with **players**, not submissions.

An append-only log of every run — the obvious shape, and the one the design
sketch asked for — is the one thing here that would let anyone inflate the
database for the price of a POST. Nothing needs it: "3rd out of 214" is a count
over the board, and a rank is computed on read.

### The game-wide record is kept, and kept small

`game_scores` holds the record: one row per game under `period = 'all'`, the
best anyone has managed, which is what the homepage roll and the wall's cabinet
tabs read. A daily game keeps one row per calendar day as well, because "best
today, worldwide" is a different number from the record and its end card says
so; `prune_leaderboards()` ages those out after 90 days.

It is maintained by the same function in the same transaction as `game_leaders`,
so a new record lands in both. They can still differ in one direction, and
deliberately: a record whose holder is gone — `delete_player()` nulls
`player_id` rather than dropping the score — or which predates the boards has no
`game_leaders` row at all, so `game_scores` can be better than the top of the
All-time board. **The roll is the record; the board is the top ten named
players.** Nothing reconciles them downwards, because every write path here only
ever moves a record the improving way.

## The write path

```text
submit_game_run(p_slug, p_score, p_day, p_player_id, p_write_token, p_run_id,
                p_name)
  → json { best, accepted, your_best, rank, total, above }
```

Guarded in this order, and the order is the point — each check is cheaper than
the next, and nothing writes to a table before the throttle has had its say:

```text
1. plausibility   p_score against the game's min_score / max_score.  no writes
2. throttle       per-IP then per-player token buckets                bounded
3. dedupe         one row per run_id                                  unbounded
```

Deduplicating first reads better, but it would mean an unthrottled `INSERT`:
every request with a fresh `run_id` would add a row before anything checked
whether it was allowed to. `submit_limits` has one row per IP per window;
`submitted_runs` has one per run.

Dedupe is not paranoia. `submitScore()` posts with `keepalive` at game over and
a failed submission is retried later, so the same finished run genuinely does
arrive twice.

A duplicate, a throttled caller and an implausible number are all treated the
same way: nothing is written, and the current numbers are returned anyway. **The
function must not raise for them.** Both call sites use a bare `.then()` inside
their game-over handler, so an error would cost the player their overlay, share
button and replay control. A game with no `game_config` row still raises, because
that is a wiring mistake and should be loud.

The other three functions:

```text
save_player(p_player_id, p_write_token, name, email, prefs…) → boolean
delete_player(p_player_id, p_write_token)                    → boolean
my_standing(p_slug, p_period_kind, p_day, p_player_id)       → json
```

`my_standing()` is the only **read** that cannot be a plain PostgREST query,
because rank and board size are not columns. The boards themselves are a table
read — `game_leaders` has a public read policy and a foreign key to `players`,
so ordering, `limit` and an embedded `players(name)` give the top ten with names
in one request and no function at all.

`p_name` is optional and advisory. The POST already happens at game over, so a
run can put a name on the board without a second request — but a wrong write
token, a blocked player or a name the board will not take all mean "no name was
written", never "the score was lost". It can only *set* a name, never clear one:
clearing is `save_player()`'s job, from the player card, so one stale read in a
game cannot unsign somebody from every board at once.

## What stops it being abused

The anon key is public by design, so the write path is unauthenticated and the
database is the only place limits can live. Network-layer flooding is the
platform's problem; application-level abuse is this section's.

* **Rate limits** per hashed IP and per player, as token buckets inside the
  function. Over the limit, the current best is returned rather than an error.
* **Plausibility clamps** per game (`min_score`, `max_score`). Without them one
  POST of `2147483647` owns a board permanently, because the update rule only
  ever moves a row the improving way — a bogus record is unbeatable and there is
  no revert path. `best_score >= 0` is a table constraint as well.
* **Bounded growth**: one row per player per board, plus `prune_leaderboards()`
  on a nightly `pg_cron` job — old day and week boards, a daily game's
  `game_scores` rows past 90 days, everything below the top 200, spent
  rate-limit buckets, run ids past a week, and players who left no board row,
  no game-wide record and no email. That last clause matters: without it the
  prune would delete a player still named on a record and the `on delete set
  null` foreign key would quietly turn a signed record into an unsigned one.
* **Emails are not readable by any browser, ever.** Not a policy that could be
  mis-edited: `select` is granted on `players` *by column*, and `email`, `tz`,
  the preferences and `write_token` are not among them. `select=email` is a 403
  and `select=*` cannot return it.
* **Moderation** without losing scores: `players.blocked` stops `save_player()`
  writing a name, and clearing the name removes it from every board at once.
* Row-level security is on everywhere, `insert`/`update`/`delete` are revoked
  from `anon` on every table, `submit_limits` and `submitted_runs` have no read
  policy at all, and the `security definer` functions are the only write path.
* The `anon` role carries a `statement_timeout`; the browser has already given
  up after `TIMEOUT_MS` (4 s) in `ui/leaderboard.js`.

## Supabase is a service, not a backend

Supabase provides the leaderboard and nothing else. It must not become an
application backend.

* No game requires it to start, run, or finish.
* No gameplay state or progress is stored in it. The optional name and email are
  the only player data it holds, and neither is required to play.
* Local play and local best scores are unaffected by its absence.
* A game with `leaderboard: false` never contacts it.
* Credentials reach the browser through the two-name allowlist in §35. The anon
  key is public by design; row-level security and column grants protect the data.

If Supabase is unavailable, the visible effect is a board that says so and a
missing global-best line. Nothing else.

---

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

* **Smoke** — driven by `src/data/games.js`, so every registered game *and
  non-game page* is covered automatically and the suite grows as either is
  added. Assertions that do not hold for every game are gated on registry
  capability flags such as `hasRestart` and `hasOverlay`, rather than assumed.
  This layer is broader than its name suggests and is where the platform's own
  invariants are pinned: `site.spec.js` (heads, the sitemap, and font preloads
  matched to real usage), `a11y.spec.js` (tap-target floor, dialog semantics,
  focus return, reduced motion, pre-paint theme), plus `home.spec.js`,
  `wall.spec.js` and `account.spec.js` for the three pages that are not games.
* **Game-specific** — core mechanic, win and loss conditions, restart. Only for
  games whose complexity earns it.
* **PWA** — manifest and icons, and the absence of any worker, cache or
  offline mode (§19).

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

npm run validate       # registry <-> filesystem, metadata, assets, the SQL seed
npm run check:bundles  # per-page gzipped JS and CSS against the §23 budgets

npm run test
npm run test:dev       # Playwright against :5173
npm run test:preview   # Playwright against :4173

npm run dev:lan        # dev server on the local network, for real devices
npm run preview:lan    # ditto, against the built output

npm run game:new <slug>
```

`check:bundles` needs a build first — it measures `dist/`, not source.

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

## What must stay true of a page, whatever it looks like

A visual change is a performance change. These are the properties a retheme has
to preserve, and each is checkable:

* **First paint never waits on the network.** Every page renders complete with
  no request answered: the shelf, the boards and the player card are all whole
  before any score arrives, and a number that never arrives stays a dash. A
  board is decoration on a finished page, not the page.
* **Indexable markup is emitted at build time**, by `homepageFromRegistry()` in
  `vite.config.js` — never rendered client-side (§28).
* **The theme is settled before the first paint.** The bootstrap is inlined and
  parser-blocking, and its plugin runs `"pre"` so Vite still sees a plain
  `<head>` when it injects preloads. Nothing may move the theme decision into a
  module.
* **A page preloads only the font weights it renders**, in both directions —
  `tests/smoke/site.spec.js` pins this for every page, so a new face that is
  preloaded but unused, or used but not preloaded, fails the suite.
* **Nothing moves when late text arrives.** A name, a rank, a board or a score
  lands in a box already the right size. The site does this two ways: a
  `min-height` on any element whose text arrives late, and, where several states
  share one region, stacking them in a single grid cell so the region is always
  as tall as its tallest state.
* **Decoration is CSS.** Gradients, pseudo-elements and attribute selectors, not
  a script and not an image.
* **Reduced motion silences the decorative.** Celebrations, blinking cursors and
  loading pulses go; the interface still works and still says the same things.
* Nothing here reintroduces a cache, a worker or a framework (§19, §41).

---

# 35. Configuration and Secrets

Client configuration reaches the browser through Vite's env system.

```text
Vercel env vars
        ↓
vite.config.js 
        ↓
import.meta.env  (statically replaced at build time)
        ↓
src/shared/ui/leaderboard.js
        ↓
games that opt into the leaderboard
```

* Vite exposes only `VITE_`-prefixed variables on its own, and these two carry
  no prefix — they are named the way the Supabase integration writes them. So
  `vite.config.js` reads the full environment with `loadEnv(mode, rootDir, "")`
  and injects **exactly these two names** through `define`.
* **The allowlist is the point.** Widening `envPrefix` to `"SUPABASE_"` would
  have been one line, and would also have exposed `SUPABASE_SERVICE_ROLE_KEY`
  and `SUPABASE_JWT_SECRET` — which the Supabase/Vercel integration adds to the
  same project — by inlining them into public JavaScript. Two names cannot leak
  a third. The build additionally **fails** if a variable matching
  `SUPABASE_*(SERVICE|SECRET|PASSWORD|JWT)` or `POSTGRES_*` is present, so that
  mistake cannot ship even by accident.
* The Supabase anon key is public by design; row-level security protects the
  data (§27). The service-role key is not, and never reaches the client.
* Always write the full literal `import.meta.env.SUPABASE_URL`. A computed key
  such as ``import.meta.env[`SUPABASE_${name}`]`` is **not** statically
  replaced: it works in dev and silently yields `undefined` in production.
* Renaming either variable means changing `define` in `vite.config.js` too —
  they are a matched pair, and there is no runtime lookup that would paper over
  a mismatch.
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
* Icons
* The tombstone service worker (§19)
* Sitemap
* Metadata

There should be no requirement for a persistent application server for core gameplay.

Supabase remains an optional external service, for the leaderboard and nothing
else. It is not an application backend, and §27 sets out what that means in
practice: no game needs it to start, run or finish.

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
* `/fonts/*` — the webfonts, also stable-filename — revalidating, one day.
  Fonts sit under neither of the two prefixes above and need their own rule; a
  face with no cache header is re-fetched on the critical path of every visit.

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

All four cover accessibility, motion, touch and copy as first-class concerns
rather than as a pass at the end. They gained those sections after a platform
review found defects — an end card that was not a dialog in any game, six games
with sound and no mute, a 13-pixel-tall back link — that the documents as
written could not have caught, because they only described how a screen should
look.

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
7. Does it reintroduce caching or an offline mode (§19)?
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
* A shared colour token that overrides a game's own palette
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
* A client that compares scores, or knows which direction wins
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
