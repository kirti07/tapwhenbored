# Game Testing Skill

## Purpose

Use this skill whenever a game is created or changed.

The goal is to verify that the game still works from the player's perspective after every functional change.

> **Implement → Test → Fix → Test again.**

Do not consider a functional change complete until the relevant tests pass.

---

## 1. When to Run Tests

Run functional tests immediately after:

* Adding a new game
* Changing game mechanics
* Changing game rules
* Changing game state
* Changing input handling
* Changing win/loss conditions
* Changing scoring
* Changing restart behavior
* Changing game generation
* Fixing a gameplay bug

Do not wait until the end of a large implementation to test.

---

## 2. Test the Player Experience

Tests should interact with the game through the browser.

Test:

* What the player sees
* What the player clicks/taps
* What happens after an interaction
* Whether the game progresses correctly
* Whether the game ends correctly
* Whether the player can restart

Prefer user-visible behavior over implementation details.

Prefer:

```text
Tap a safe tile
→ tile is revealed
```

over:

```text
gameState.tiles[3].revealed === true
```

---

## 3. Test the Core Mechanic

Every game must have functional tests for its primary mechanic.

Identify:

1. How the game starts
2. What the player does
3. What constitutes valid progress
4. What constitutes failure
5. What constitutes success
6. How the game restarts

The tests should cover the important paths through the mechanic.

Do not test every possible interaction if a smaller set of tests provides equivalent confidence.

---

## 4. Minimum Functional Test Coverage

For a non-trivial game, cover:

### Start

The game reaches a playable state.

### Core interaction

The primary player action works.

### Progress

A valid action produces the expected game behavior.

### Failure

The important failure condition works.

### Completion

The win/goal condition works.

### Restart

The game can be restarted from a completed or failed state.

---

## 5. Test the Actual Input

Use the same interaction mechanism the player uses.

Examples:

```text
Mouse click
Touch/pointer interaction
Keyboard input
Dragging
Drawing
```

Prefer Playwright browser interactions over directly calling game functions.

Do not bypass the UI merely to make tests easier.

---

## 6. Test Important Edge Cases

Test edge cases when they can affect gameplay.

Examples:

* Clicking rapidly
* Clicking the same object repeatedly
* Drawing outside the valid area
* Touch interaction near boundaries
* Restarting immediately
* Restarting after game over
* Completing the game at the boundary condition
* Invalid moves
* Empty/generated states
* Minimum and maximum values

Do not create large numbers of edge-case tests without a meaningful failure risk.

---

## 7. Randomized Games

Do not make functional tests depend on uncontrolled randomness.

Where necessary, use:

* Deterministic test fixtures
* Fixed seeds
* Controlled game states
* Test-specific generation

Test the invariant rather than a particular random layout.

For example:

```text
Generated puzzle
→ must always be solvable
```

rather than:

```text
Tile 7 must always contain the bomb
```

---

## 8. Game-Specific Tests

Each non-trivial game should have its own functional test file.

Example:

```text
tests/
└── games/
    ├── honeycomb.spec.js
    ├── doodle-on.spec.js
    └── untangle.spec.js
```

The test should focus on the rules and interactions specific to that game.

---

## 9. Smoke Tests

Every registered game should be covered by the global smoke test.

Smoke tests should verify at minimum:

* Page loads
* Game initializes
* No uncaught JavaScript errors
* No unexpected console errors
* Game surface exists
* Basic interaction works
* No horizontal overflow

The smoke test should use the game registry so that adding a game automatically adds it to the smoke-test population.

---

## 10. Responsive Testing

Test games at representative mobile and desktop viewport sizes.

Verify:

* Game fits within the viewport
* No horizontal scrolling
* Controls are accessible
* Touch interaction works where applicable
* Text does not overflow
* Game surface scales correctly
* Desktop interaction works

Do not require mobile and desktop layouts to be identical.

---

## 11. PWA Testing

When changing PWA functionality, test:

* Manifest availability
* Every declared icon existing
* Application loading
* That no page registers a service worker
* That nothing lands in Cache Storage
* That a visited game is *not* playable offline
* That a cache left over from an earlier build is cleared
* That registering `/sw.js` unregisters itself and takes the caches with it

There is no caching and no offline mode, in a browser tab or in the installed
app (ARCHITECTURE.md §19), so most of these specs assert an absence.
`asInstalledApp()` in `tests/pwa/pwa.spec.js` fakes a standalone launch for the
one spec that checks an install does not turn caching back on — `display-mode`
itself cannot be emulated, because Chromium's `Emulation.setEmulatedMedia`
ignores the feature.

A PWA change requires PWA tests in addition to the affected game tests.

---

## 12. Leaderboard Testing

The current leaderboard model is:

> One global best score per game.

When leaderboard functionality changes, test:

### Best score

A new best score updates the global best.

### Non-best score

A lower score does not replace a higher best score when higher is better.

### Retrieval

The current best score can be displayed.

### Failure

A leaderboard/network failure does not break gameplay.

Do not add tests for accounts, rankings, score history, or other leaderboard features that do not exist.

---

## 13. Network Failure

Network-dependent functionality must not break the game.

For example:

```text
Game finishes
→ Score displayed
→ Leaderboard request fails
→ Game remains usable
→ Restart still works
```

Test this behavior whenever network-dependent functionality is changed.

---

## 14. Console Errors

Functional tests should detect unexpected:

* JavaScript exceptions
* Unhandled promise rejections
* Relevant console errors

Do not ignore errors simply because the game appears to work.

---

## 15. Test Scope After Changes

Choose the test scope based on the change.

### Game-specific change

Run:

```text
Game functional tests
+
Game smoke test
```

### Shared code change

Run:

```text
All relevant smoke tests
+
Affected game tests
```

### PWA change

Run:

```text
PWA tests
+
Affected game tests
+
Smoke tests
```

### Leaderboard change

Run:

```text
Leaderboard tests
+
Affected game tests
+
Smoke tests
```

### Build/configuration change

Run:

```text
Validation
+
Production build
+
Browser test suite
```

When uncertain, run the broader test scope.

---

## 16. After a Test Failure

When a test fails:

1. Determine whether the failure is in the game or the test.
2. Reproduce the failure.
3. Identify the player-visible problem.
4. Fix the smallest appropriate change.
5. Run the failing test again.
6. Run the relevant broader tests.

Do not weaken or remove a test simply because it fails.

---

## 17. Avoid Brittle Tests

Avoid depending unnecessarily on:

* Internal variable names
* Internal function names
* CSS implementation details
* Exact DOM structure
* Animation timing
* Random outcomes
* Arbitrary delays

Prefer stable user-facing selectors and observable behavior.

Tests should survive reasonable implementation and UI refactoring.

---

## 18. Production Build

Development mode is not sufficient for final verification.

Before shipping, run the production build and test the built application.

At minimum:

```bash
npm run validate
npm run build
npm run test
```

---

## 19. Completion Criteria

A functional change is complete only when:

* The requested behavior works
* The relevant functional tests pass
* No new runtime errors are introduced
* Relevant smoke tests pass
* Mobile/desktop behavior remains valid
* The production build succeeds when required

For a new or substantially changed game, verify the complete core gameplay loop.

---

## 20. Final Rule

> **Every functional change must be followed by functional testing.**

Do not assume a change works because the code looks correct.

Verify it through the player's experience.
