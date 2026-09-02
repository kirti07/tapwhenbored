# Tap When Bored — Claude Instructions

Tap When Bored is a collection of lightweight, single-player games.

## Core Principles

* Keep games independent.
* Keep the MPA architecture.
* Use Vite as a build tool, not an application framework.
* Prefer vanilla JS, HTML, and CSS.
* Keep games fast, lightweight, and replayable.
* Keep shared code limited to genuine platform infrastructure.
* Test user-visible behavior.
* Make the smallest change that solves the problem.

## Reference Documents

### Architecture

For repository structure, technical decisions, PWA, bundles, dependencies, leaderboards, build, deployment, and architecture changes:

`ARCHITECTURE.md`

Read this before making architectural changes.

### Game UI Philosophy

When designing a game's UI or visual language:

`.claude/SKILLS/GAME-UI-PHILOSOPHY.md`

### Game UI Review

When reviewing or evaluating a game's UI/UX:

`.claude/SKILLS/GAME-UI-REVIEW.md`

### Game UI Refinement

When refining or improving an existing game's UI:

`.claude/SKILLS/GAME-UI-REFINEMENT.md`

## Testing
After any functional or gameplay change, use `.claude/SKILLS/GAME-TESTING.md` and run the relevant tests before considering the change complete.

When adding or changing functionality, test the user-visible behavior.

Before considering a change complete:

* Run the relevant tests.
* Check the affected game on mobile and desktop.
* Check for console errors.
* Run broader tests when shared code is changed.
* Run the production build before shipping.

## Changes

* Do not modify unrelated games or files.
* Do not introduce unnecessary abstractions or dependencies.
* Do not change architecture without checking `ARCHITECTURE.md`.
* Preserve existing game mechanics unless the task explicitly changes them.

## Priority

1. Gameplay
2. User experience
3. Performance
4. Simplicity
5. Reliability
6. Visual polish
