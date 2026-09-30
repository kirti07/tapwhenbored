# V4 — `v4-weekly` · "Weekly Table"

## Concept in five lines

One component, everywhere: **this week's table**. Every board on the site is the same
5-row window — top 3, then you and the row above you — under a quiet "Resets Sunday". The
rhythm is weekly, so no board is ever a wall of unbeatable numbers from
whoever played most in week one. A seeded **Par** row (the maker's own target score) sits
on every board so it is never empty and never advertises emptiness. The ask is one
nickname field on your first finish, remembered forever; email is a separate, later step
sold as one thing — *"We'll email you Sunday if you finish top 3."*

## The signature component

`.wk` is built once by a single `renderWk()` function that every page inlines verbatim.
The same function, the same DOM, the same class names produce the window on `end-first`,
`end-returning`, `home` (the combined all-games panel) and `leaderboard`. Only the data
and the accent dot change.

```
[dot] Flip It · this week            RESETS SUNDAY
      Moves · fewer is better        (in 2 days, on hover)
 ① Nadia Kova 👑                                  7
 ② Tomas Reyes                                    8
 ③ Par  [target]                                 10
 ────────────── 5 more players ──────────────
 4  Bea Mwangi                                   11
 5  Quiet Otter 42  [you]      ▲2       12 moves
 → Nice — two moves off the top three.
 14 players this week                Full table ›
```

**Height is constant in every state.** Header 44 px, five 40 px rows, one 18 px gap strip,
a 30 px drama line, a 30 px footer — every one of them a fixed `height`, not a `min-height`,
with the title, the unit line, the drama string and the player count each clamped to a single
line. Loading swaps in five skeleton rows of the same height; empty swaps in the Par row plus
four "Open" rows; error swaps in a 218 px message block that is exactly the rows' height and
blanks the drama and count strips, because a failed fetch has nothing encouraging to say.
Nothing about the card moves when the network answers, and nothing moves when you save a name.

## What is playful

- **League drama, calmly written** — encouraging rather than competitive. "Nice — two moves
  off the top three.", "One move off second. Good week.", "1 point off 6th — one more board.",
  "Under 10 and the week is yours.", "Three off the all-time best."
- A small **crown** on the week's leader, green **▲2** promotion arrows, medal chips on 1–3.
- **"Resets Sunday"** — the board is visibly temporary, said once and quietly. The exact time
  left is a detail on hover or tap, not a clock counting down at you.
- **Par** as a character: a row you can beat, that never wins the week.
- The homepage panel is a cross-game currency (a point per board you're on, +2 for a top
  three) so the homepage looks inhabited even when eight per-game boards are thin.
- Two motions in the whole direction: the end card's entrance, and a single 520 ms sweep over
  your own row, once. Both have a reduced-motion variant. Full spec under **Polish pass**.

## What keeps it stable

- Reserved heights everywhere: the window (above), `.dmean` 40 px, `.d-ask` **176 px fixed**
  with four fixed slots inside it (42 px heading / 50 px input / 48 px buttons / 16 px note),
  so the name step, the email step, the sent state and both "Not now" outcomes are drawn into
  the same box rather than stacked on top of each other; the share-note strip 18 px,
  `#mailBody` 214 px on the account page, `.lb-card` 560 px.
- The end card is a real dialog: `role="dialog" aria-modal="true"`, focus moves to
  **Play again** on open, Escape closes it and reveals a "Show result" button, and the game
  behind gets `inert`.
- Buttons never move or restyle; the primary/secondary pair sits in the same place on both
  end cards.
- Inputs are 16 px with `autocomplete="nickname"` / `"email"`, `inputmode="email"`,
  `enterkeyhint`. Every control has a ≥ 44 × 44 hit area — a few keep a smaller visual and
  get the rest from padding or a pseudo-element. `:focus-visible` is a 3 px accent ring.
  `-webkit-tap-highlight-color` is off and `touch-action: manipulation` kills the 300 ms
  double-tap delay; every `:hover` is behind `(hover: hover) and (pointer: fine)`.
- Light and dark are both authored from tokens, via `@media (prefers-color-scheme: dark)`
  **and** `html[data-theme="dark"]`, plus `color-scheme` so native checkboxes and
  scrollbars follow the chosen theme. `?theme=dark|light` is applied before first paint by
  an inline script in `<head>`; there is no flash and no shift.
- No red anywhere. Down-movement is a neutral grey ▼, not a warning.

## Costs

- **Fonts: no webfont request at all, and no display font.** Nunito — the site's existing
  face — is declared as an inline `@font-face` with `src: local("Nunito")` only, so anyone
  with it installed gets it and everyone else gets `ui-rounded / SF Pro Rounded /
  -apple-system`, which is what tapwhenbored.com already uses for body copy. This was a
  deliberate change during the build: a `<link rel="stylesheet">` to Google Fonts blocks
  the `load` event and hung the screenshot run outright, and even an `@font-face` pointing
  at `fonts.gstatic.com` intermittently stalled it for 30 s. Dropping the request makes the
  pages render identically online and offline, with no FOUT and no layout shift — which is
  the whole promise of this direction. On the real site Nunito is already self-hosted, so
  nothing is lost. **No display font was added**: this direction's personality is in the
  copy and the table, not in lettering, and that is one fewer request to pay for.
  *Cost if you disagree:* one Google Fonts `<link>` plus a ~14 KB latin woff2, and the FOUT
  discipline (`size-adjust` on the fallback) that goes with it.
- **Assets: none.** The eight game marks are inline SVG geometry (~120 bytes each), not
  images. No thumbnails, no illustrations.
- **Backend: this is the expensive direction.** Today the server stores one aggregate
  number per game (`game_scores(game_slug, period, best_score)`), and `period` already
  supports `'YYYY-MM-DD'`. V4 needs real per-player rows and three aggregates that do not
  exist yet:
  1. a `players(id, name, email?, created_at)` table and a `scores(player_id, game_slug,
     period, score, created_at)` table with `period` extended to `'YYYY-Www'`;
  2. an RPC `get_week_window(slug, player_id)` returning **exactly the five rows** the
     component draws — top 3 plus the player and the row above — in one round trip, plus
     the player count and the gap count. Doing this client-side would mean shipping the
     whole table;
  3. a weekly job that closes the week, keeps last week readable for seven days, and sends
     the one Sunday email to top-3 finishers.
  Par is a seeded row per game in `scores` with a synthetic player, which is the cheapest
  part and does most of the work.
- **Email: one transactional send per player per week, maximum,** plus magic links. That
  is a real (small) sending reputation and unsubscribe obligation.

## Known weaknesses

1. **The end card is still the tightest layout in the set,** though it now has room to
   breathe: 752 px of the 796 px available on a 390 × 844 phone, with 60 px below it and no
   internal scroll. That is about two lines of slack. A designer adding a fourth sentence of
   meaning still has to take something out.
2. **The one-line strings are a layout guarantee now, and a copy discipline as well.** The
   drama line, the player count, the board title and the unit line are all fixed-height and
   clamped with `text-overflow: ellipsis`, so an over-long string truncates instead of
   growing the card. That protects the "identical height everywhere" promise, but a writer
   who ignores the ~34-character budget will see an ellipsis rather than a warning. The unit
   line on the homepage panel is the tightest of them (203 px of room at 1280 wide).
3. **Weekly boards need weekly traffic.** Par and the honest "14 players this week" /
   "Nobody else yet — Par is the mark" footers mitigate it, but on a genuinely
   quiet week the window is Par and four grey "Open" rows. That is honest and it is still
   better than an empty box, but it is not exciting.
4. **The cross-game points metric is invented.** "One point per board you're on, +2 for a
   top three" is stated in the panel, but it is a new concept players must read. Dev (the
   rank-literate persona) will ask what stops him from placing on eight boards with eight
   terrible scores — the answer is nothing, which is why it is a participation currency and
   the per-game boards are the real ones.
5. **Ties are stated but not shown.** The rules panel says "same score, same rank; ties go
   to whoever got there first", and the all-time tab does show shared rank numbers, but the
   mock weekly data deliberately avoids ties in the 5-row window because two adjacent rows
   numbered "6" read as a bug at that size. Real data will hit this on move-count games
   constantly and it needs a design answer.
6. **`?theme=` overrides the stored preference on every load,** which is right for the
   version viewer and wrong for a real site. Trivial to invert; noted so nobody copies it.

## Polish pass

A second pass driven by the Priya and Aisha persona walkthroughs, Emil Kowalski's design-
engineering notes and the animation build sequence. Everything below is verified by a
Playwright script at 390 × 844 and 1280 × 800 (hit areas, `scrollWidth`, end-card height in
every state, dialog focus and Escape, clipboard) and by re-reading all 24 screenshots.

### Stability — the thing this direction promises

- **The end card no longer grows when you save a name.** It measured 441.8 → 465.8 px on
  desktop and ~791 → 815 px on mobile, because `.d-ask` was a `min-height: 172px` and the
  email step simply overflowed it. It is now a fixed `height: 176px` containing four
  fixed-height slots, and every state — name ask, email ask, sent, "no name for now", "no
  email" — is written into those same four slots by one `ask()` helper. The saved
  confirmation **replaces the name-step heading in place** rather than being a new block
  stacked above it, which is what used to push `Play again` down the card.

  | State | Mobile 390 × 844 | Desktop 1280 × 800 |
  |---|---|---|
  | first time | 752.0 px | 413.0 px |
  | saved (demo pill) | 752.0 px | 413.0 px |
  | saved (real `Save name` click) | 752.0 px | 413.0 px |
  | "Not now" on the name | 752.0 px | 413.0 px |
  | sent | 752.0 px | 413.0 px |
  | loading | 752.0 px | 413.0 px |
  | empty | 752.0 px | 413.0 px |
  | error | 752.0 px | 413.0 px |

- **Vertical rhythm tightened** so the card has real headroom: rows 42 → 40 px, gap strip
  20 → 18 px, drama 32 → 30 px, window padding 12/10 → 10/8, card padding 14 → 12 px, card
  gaps 10 → 8 px, title 25 → 23 px. Mobile went 791 px in 796 px of room to **752 px with
  60 px below it and 32 px above**, and the card never scrolls internally. Desktop went
  441.8 → 413 px. The card's `max-height` is now `calc(100svh - 48px)` so it can never
  overlap the space the wrapper reserves at the bottom.
- **Every strip in the window is a fixed `height`,** with the title, unit line, drama string
  and player count each clamped to one line. Previously two of them were `min-height`, which
  is why the empty state was 7.5 px taller than the full one on a narrow phone.
- The error state now blanks the drama line and the player count instead of claiming
  "14 players this week" underneath "Couldn't reach the board".

### Hit areas — every control ≥ 44 × 44

Topbar icon buttons 42 → 44. Difficulty pills 40 → 44. Time-window tabs 40 → 44. The
"‹ Games" back link 32 → 44 (padding, pulled back with a negative margin so nothing moves).
`What is this?` 34 → 44. "Full table ›" keeps its 30 px of ink and gets a 45 px hit band
from an absolutely positioned `::after`. The two email-preference checkboxes were 20 × 20
native boxes; they are now `appearance: none` controls that are **44 × 44 of target around
20 px of ink**, drawn from tokens so light and dark both follow, with the focus ring on the
visible box rather than the whole target. The grey demo pill is deliberately excluded — it is
scaffolding, not design.

### Calmer at 11pm (Aisha)

The weekly table stays; the league framing does not.

- **The countdown is gone.** The live `0d 11h 56m` ticker (a `setInterval` every 30 s on every
  page) is replaced by a quiet **"Resets Sunday"** chip. The time left — coarse, "in 2 days",
  never minutes, so it never needs to tick — is revealed on hover on a fine pointer or on tap,
  in a slot whose height is always reserved. `play.html`'s week bar says "Resets Sunday" too
  instead of showing a second live clock on the same screen.
- **The crown is smaller** (14 × 11 → 11 × 9) and a shade quieter.
- **The drama line is encouraging, not competitive:** "2 moves off 3rd." → "Nice — two moves
  off the top three."; "One move off 2nd." → "One move off second. Good week."; "Beat 10 and
  you top the week." → "Under 10 and the week is yours."; "3 moves off the record." → "Three
  off the all-time best."
- **Share is unchanged and still works.** "I cleared FLIP IT in 9 moves this week on Tap When
  Bored. 3rd — come and take it." tries `navigator.share` first and falls back to
  `clipboard.writeText`. One fix: `Link copied` now appears **only on the clipboard path** —
  the share sheet is its own confirmation — and it fades into a slot that is always reserved,
  so confirming never moves a button.

### Motion spec

Every animation below has a purpose, one animated property, a curve from the token set
(`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`), a duration inside the budget, and a
reduced-motion variant.

| What | Should it animate? | Purpose | Property | Easing | Duration | Reduced motion |
|---|---|---|---|---|---|---|
| End card entrance | Yes — seen once per run (occasional tier) | Preventing a jarring change: the card is not part of the screen the player was looking at | `transform: scale(.96 → 1)` + `opacity`, via `@starting-style` so it is CSS-only | `--ease-out` | 220 ms transform / 160 ms opacity | Opacity only, 140 ms linear, no scale |
| Scrim behind it | Yes | Same | `opacity` | `--ease-out` | 200 ms | Unchanged (opacity is safe) |
| "Your row" sweep | Yes — once, on a personal result | State indication: where this run landed | `opacity` on a translucent `::after` overlay (was `background`, a paint property) | `--ease-out` | 520 ms (was 700 ms) | `animation: none` — the row keeps its permanent tint, left bar and "you" chip, so nothing is lost |
| Name-saved confirmation | Yes | Preventing a jarring change: the heading is replaced in place inside a fixed box | `opacity` on the new content, via `@starting-style` | `--ease-out` | 160 ms | Kept, 100 ms linear — opacity aids comprehension |
| Button press | Yes — every tap | Feedback: the interface heard you | `transform: scale(.97)` (was `translateY(1px)`) | `--ease-out` | 140 ms | `transform: none` |
| Reset-chip time reveal | Yes | State indication for a disclosure | `opacity` | `--ease-out` | 140 ms | `transition: none` |
| Share confirmation | Yes | Feedback | `opacity` in a reserved slot | `--ease-out` | 140 ms | `transition: none` |
| Tab switch on the board | Content: yes. Indicator: **no** | Ten rows swap at once and would otherwise teleport | `opacity` on the table body, via WAAPI | `--ease-out` | 140 ms | Not run at all |
| **The countdown** | **No — removed** | It had no purpose beyond tension, it ran forever on every page, and it was the single thing the night-time persona named as stressful | — | — | — | — |
| **Tab indicator slide** | **No — rejected** | The pill's background swap is instant and correct; the board behind it has a reserved 560 px so nothing jumps. Motion here would be decoration on an element you click three times a visit | — | — | — | — |

Two structural notes on the implementation: the row sweep is a keyframe animation because it
fires once and is never retriggered, and everything a user can fire twice in a second (press,
share, state swaps) is a CSS `transition` so it retargets from its current value instead of
restarting from zero. Nothing animates `width`, `height`, `margin` or a colour except the
gated hovers.

### Verification

`node research/tools/shoot.cjs research/ux-versions/v4-weekly` — 24 PNGs, no console errors,
all read. One Playwright script asserts, at both viewports: no button / link / input with a
hit area under 44 × 44; `scrollWidth === innerWidth`; the end-card height identical to the
tenth of a pixel across all eight states above; the card fits 844 with 60 px of headroom and
no internal scroll; Escape closes the dialog and `Show result` reopens it; focus lands on
`Play again` on load; Share writes the expected string to the clipboard and `Link copied`
appears without moving the card. All clean.

## Files

| File | What it shows |
|---|---|
| `home.html` | Header with identity chip + theme toggle, the combined all-games weekly panel, 8 game cards each carrying your standing this week, three explainer notes, footer. |
| `play.html` | Flip It mid-play (Lights-Out 5×5, moves/time/week-best, difficulty pills). The board entry point is the `weekbar` under the topbar: "3rd this week · 1 move off 2nd · Resets Sunday". |
| `end-first.html` | Never-named player. Result → meaning → the window → name ask (pre-filled "Quiet Otter 42") → **separate** email step in the same reserved box → sent state. `Play again` / `Share` / `Link copied`. Demo pill cycles first time / saved / sent / loading / empty / error. |
| `end-returning.html` | Named player. No ask at all — result, the window with your row swept once, `Play again` / `Share`. |
| `leaderboard.html` | Flip It's page: 8-game switcher (Untangle and Doodle On disabled, with the reason), This week / Last week / All-time tabs, the identical window, top 10 with a pinned "you" row on All-time, and a "How this board works" rules panel. Demo pill cycles full / loading / empty / error. |
| `account.html` | Editable name, this week's standing and all-time best on all 8 games, the Word Steps streak, magic-link email flow with its sent state, two email preferences, sign out and delete. Demo pill cycles no email / sent / linked / loading / error. |
| `shots/` | 24 PNGs — every screen at 390×844 and 1280×800, light and dark. |

Exact copy strings used throughout, unchanged: `Play again`, `Share`, `Link copied`,
`Save name`, `Not now`, `Send magic link`. Honesty line on every screen: *"Boards are for
fun — scores aren't verified."*
