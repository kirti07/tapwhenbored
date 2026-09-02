# Tap When Bored — Architecture

## 1. Purpose

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

The system should make adding game #50 nearly as straightforward as adding game #5.

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

---

# 5. Multi-Page Application

Tap When Bored uses an MPA architecture.

Example:

```text
/
├── index.html
│
├── /games/honeycomb/
│   └── index.html
│
├── /games/doodle-on/
│   └── index.html
│
├── /games/untangle/
│   └── index.html
│
└── /games/word-steps/
    └── index.html
```

Each HTML page is a Vite entry point.

The browser loads only the resources required by the current page.

For example:

```text
/games/honeycomb/

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
├── index.html
├── package.json
├── vite.config.js
├── CLAUDE.md
├── ARCHITECTURE.md
│
├── src/
│   ├── shared/
│   │   ├── css/
│   │   │   ├── tokens.css
│   │   │   ├── base.css
│   │   │   └── shell.css
│   │   │
│   │   └── ui/
│   │       ├── theme.js
│   │       ├── share.js
│   │       ├── sound.js
│   │       └── storage.js
│   │
│   └── games/
│       ├── honeycomb/
│       │   ├── index.html
│       │   ├── main.js
│       │   ├── game.js
│       │   ├── style.css
│       │   └── assets/
│       │
│       ├── doodle-on/
│       │   ├── index.html
│       │   ├── main.js
│       │   ├── game.js
│       │   ├── style.css
│       │   └── assets/
│       │
│       └── ...
│
├── data/
│   └── games.js
│
├── scripts/
│   ├── new-game.js
│   ├── validate-games.js
│   └── generate-sitemap.js
│
├── tests/
│   ├── smoke/
│   ├── pwa/
│   └── games/
│
└── public/
    └── icons/
```

The exact internal structure of a game can vary according to its complexity.

A small game does not need unnecessary abstraction.

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

`data/games.js` is the source of truth for the game catalogue.

Example:

```js
export const games = [
  {
    slug: "honeycomb",
    title: "Honeycomb",
    description: "...",
    path: "/games/honeycomb/",
    category: "puzzle",
    featured: true,
    pwa: true
  }
];
```

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
game/
├── index.html
├── main.js
├── game.js
└── style.css
```

A more complex game may evolve into:

```text
game/
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

Complexity should determine architecture.

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
games/honeycomb/style.css
games/doodle-on/style.css
games/untangle/style.css
```

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
import honeycomb from "./games/honeycomb";
import doodle from "./games/doodle";
import untangle from "./games/untangle";
```

The purpose of the MPA is to prevent this kind of bundling.

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


The game a deliberately minimal global leaderboard model.

Each game has one global best score.

The leaderboard is a shared platform capability, while each game remains responsible for calculating its own score.

Responsibilities
Game

Each game:

Calculates the player's score.
Determines when a valid run has finished.
Submits the score when appropriate.
Decides whether a higher or lower score represents a better result, if required.
Leaderboard Service

The shared leaderboard service:

Stores the best score for each game.
Retrieves the current global best score.
Updates the best score when a new record is achieved.
Handles communication with Supabase.
Handles leaderboard errors without affecting gameplay.

Games should not contain Supabase-specific database code.

Data Model

The initial implementation should use one record per game:

game_scores
────────────────────────
game_slug       PRIMARY KEY
best_score
updated_at

---

Score Direction

Most games should use the simplest possible scoring model:

Higher score = better

If a game uses a different scoring model, such as fastest completion time, the leaderboard integration can explicitly indicate that lower is better.

Do not build a generalized scoring framework until multiple games actually require it.


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

---

# 29. Validation

A validation script should verify the repository before building.

Example checks:

```text
Game registry
    ↓
Every registered game exists
    ↓
Required files exist
    ↓
Slugs are unique
    ↓
URLs are valid
    ↓
Metadata exists
    ↓
Assets resolve
```

Validation should fail the build when structural problems are detected.

Example:

```bash
npm run validate
```

---

# 30. Automated Testing

Playwright is the primary browser-level testing framework.

Testing should focus on **user-visible behavior**, not implementation details.

Testing has three layers:

```text
                    Tests
                      │
          ┌───────────┼───────────┐
          │           │           │
       Smoke       Game-specific   PWA
       tests          tests       tests
```

---

# 31. Global Smoke Tests

Every game should automatically receive basic smoke coverage.

For every game in `games.js`, test:

* Page loads
* Correct URL
* No console errors
* No uncaught exceptions
* Game initializes
* Required game surface exists
* No horizontal overflow
* Mobile viewport works
* Desktop viewport works
* Restart works where applicable
* Theme works where applicable
* Share works where applicable

This allows the test suite to automatically grow as games are added.

---

# 32. Game-Specific Tests

Nontrivial games require tests for their core mechanics.

Examples:

### Honeycomb

* Safe tile interaction
* Bomb interaction
* Bomb consequences
* Win condition
* Loss condition
* Restart
* Solvability

### Doodle

* Drawing begins
* Drawing continues
* Collision detection
* Goal detection
* Game-over behavior
* Restart

### Untangle

* Nodes move correctly
* Rope intersection detection
* Solved state
* Restart

Tests should describe what the player experiences.

Avoid tests that merely assert internal variable names or implementation structure.

---

# 33. PWA Tests

The PWA should have dedicated browser-level tests.

Verify:

* Manifest exists
* Manifest is valid
* Required icons exist
* Service worker registers
* Homepage loads
* Game pages load
* Previously visited games work offline
* Homepage works offline after caching
* Network failures do not break core gameplay
* Cache behavior does not unexpectedly include all games

The most important flow is:

```text
Open site
 ↓
Open game
 ↓
Play
 ↓
Reload
 ↓
Go offline
 ↓
Reload
 ↓
Play
```

---

# 34. Responsive Testing

Every game must be tested at representative:

### Mobile

* Small phone
* Typical phone
* Portrait
* Landscape where relevant

### Desktop

* Typical laptop
* Large desktop

Check:

* No horizontal scrolling
* Game fits viewport
* Controls remain accessible
* Touch targets are usable
* Text does not overflow
* Canvas/SVG scales correctly
* Game remains playable

---

# 35. Testing After Changes

After modifying a game:

### Small change

Run:

```bash
npm run test
```

or the relevant game tests.

### Gameplay change

Run:

* Game-specific tests
* Smoke test for that game
* Responsive tests

### Shared infrastructure change

Run:

* All smoke tests
* All affected game tests
* PWA tests where applicable

### Build/configuration change

Run:

```bash
npm run validate
npm run build
npm run test
```

### Service-worker/PWA change

Run the full PWA test suite and production build.

---

# 36. CI Pipeline

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

---

# 37. Development Commands

Recommended commands:

```bash
npm run dev
npm run build
npm run preview

npm run validate

npm run test
npm run test:smoke
npm run test:pwa

npm run game:new <slug>
```

The exact commands may evolve, but the workflow should remain simple.

---

# 38. New Game Scaffolding

New games should be scaffolded through a script where practical.

Example:

```bash
npm run game:new honeycomb
```

The script should create:

```text
src/games/honeycomb/
├── index.html
├── main.js
├── game.js
└── style.css
```

It should also create or update the appropriate registry entry where safe.

Manual duplication of boilerplate should decrease as the number of games grows.

---

# 39. Performance Monitoring

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

# 40. Deployment

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

---

# 41. AI-Assisted Development

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

# 42. Skill Architecture

AI behavior is separated into focused skills.

Recommended structure:

```text
.claude/
└── skills/
    ├── game-design/
    │   └── SKILL.md
    │
    ├── game-development/
    │   └── SKILL.md
    │
    └── game-review/
        └── SKILL.md

.claude/SKILLS/
├── GAME-UI-PHILOSOPHY.md
├── GAME-UI-REVIEW.md
└── GAME-UI-REFINEMENT.md
```

Responsibilities:

### Game Design

Defines how games should be conceived and specified.

### Game Development

Defines how games should be implemented within this architecture.

### Game Review

Defines how completed games should be evaluated and improved.

### UI Philosophy

Defines the visual and interaction principles.

### UI Review

Defines how to evaluate the interface.

### UI Refinement

Defines how to improve an existing interface without unnecessarily changing its underlying game.

---

# 43. Architecture Change Process

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

# 44. Scaling Model

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

# 45. What This Architecture Explicitly Avoids

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

---

# 46. Final Architectural Principle

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
