# V3 — `v3-ledger` · "Quiet Ledger"

## Concept (5 lines)

Tap When Bored as a small, well-set publication that happens to keep records. Almost no
chrome: a paper ground, one ink-green accent, an editorial serif for numbers and headlines,
and hairline rules instead of boxes. The end card states the result in one line, one
sentence of meaning, a distribution bar with a *you are here* marker, and a real rank —
then stops. The board is a typographic table on its own page (`leaderboard.html`), reached
by a text link. The identity ask is late, quiet, one field, and permanently present, so
nothing ever pops into existence; the email ask does not appear on the end card at all —
it lives on `account.html`, where it is sold as *keeping* something you already have.

## Polish pass (design-engineering + motion)

Second pass over the same direction, closing the gaps the persona walkthroughs found
(Priya and Aisha both ranked this version #1, so nothing about the direction moved).

### What changed

**Share is real.** `Share` on both end cards composes a line from the live DOM and calls
`navigator.share` → `navigator.clipboard.writeText` → a `document.execCommand('copy')`
fallback, then flashes `Link copied` into a slot that is already 18 px tall, so the
confirmation shifts nothing. The note auto-clears after 2.4 s and a repeat tap retargets
the timer rather than stacking. A cancelled share sheet (`AbortError`) is silent; a
genuine failure says so in the warm colour instead of lying.

- `end-first`: `Flip It · 0:41 · faster than 62% of today's perfect solves · #37 of 214 — tapwhenbored.com/flip-it`
- `end-returning`: `Flip It · 0:34 · personal best · faster than 74% of today's perfect solves · #21 of 214 — tapwhenbored.com/flip-it`

The string is built from the result, percentile and rank actually on screen, so the demo
pill's loading / table-down states degrade it honestly instead of inventing numbers.

**The end card fits a phone.** `end-first` was ~895 px on a 390 × 844 screen and scrolled.
It is now **717 px** — `scrollHeight === innerHeight === 844`, 44 px of air above the card
and 88 px below it, with `Play again` and `Share` fully visible. Nothing was removed: the
result numeral is 44 px instead of 54, the distribution plot 46 px instead of 78, the card
gap 8 px instead of 12, and the padding two steps tighter. `end-returning` is **737 px**.
At 1280 × 800 the two cards are **727 px** and **720 px**, ~37 px clear top and bottom.

**The demo pill no longer covers a control.** The dialog layer reserves a 64 px strip at the
bottom, so at 390 × 844 the card ends at 770 px and the pill starts at 792 px. The compact
desktop padding only kicks in at 860 px — below that the centred 472 px card is still within
the pill's horizontal reach. Asserted as rect intersection at 390, 800 and 1280 wide.

**The name field is open from first paint.** Three of the five personas — including the one
who ranked this version last — asked for the same thing: the pre-filled name visible, one tap
to save. `end-first` now renders the level 16 px input carrying `Quiet Otter 42` with
`Save name` and `Not now` beside it, inside the same reserved block, and the ghost row above
it shows the row you would occupy — dashed, in ink, live-updating as you type — instead of an
italic `Anonymous`. Focus still lands on `Play again`, not the field: nothing is asked of you,
the answer is simply already typed. `Not now` collapses to the quiet re-open line, which is
where the old `+` control now lives; `Change` after saving reopens the same field. The block
holds **224 px** in every state, so the open form, the confirmation and the collapsed line all
occupy exactly the same space.

**The re-open line reads as a control.** `Add your name to the table` was a bare text row
with a hairline underline and an orphaned `+` on the far right — it read as a heading. It is
now a real 48 px surface (`--card-2` ground, hairline border, 12 px radius) with the `+` in a
22 px circle *leading* the label, hover and press states, and no added volume: no colour, no
weight change, no shouting. The `optional` hint was tried and cut — it pushed the label onto
two lines, which is louder than the problem it solved.

**The reserved block is anchored at both ends.** The ghost row is pinned to the top of the
220 px block and the trigger / form / confirmation plus its note are pinned to the bottom, so
the two things a player looks at never move — measured identical in all four states
(collapsed / expanded / saved / not now), as is `Play again`. The slack pools in the middle,
between two separate ideas, rather than under a control.

**Invisible details.** A `:focus-visible` rule was silently setting `border-radius:6px` on
whatever it ringed, squaring off every pill button on focus — removed. Every `:hover` rule on
all six pages is now behind `@media (hover:hover) and (pointer:fine)` (touch fires a false
hover on tap). `-webkit-tap-highlight-color:transparent` plus real `:active` states, and
`touch-action:manipulation` on every control (no 300 ms tap delay, no double-tap zoom).
Inputs show one ring, not a ring and a border change. Escape inside the open name field
closes the field and returns focus to its trigger; Escape anywhere else still replays, which
is the behaviour Priya rated highest. Saving a name moves focus to `Play again`, not to
`Change`. The leaderboard's game switcher has roving `tabindex`, arrow-key navigation and
edge fades that disappear when there is nothing more that way; the selected chip parks 44 px
in so it is never half-washed by the fade. The time tabs are a proper tablist with arrow keys,
`Home`/`End` and a roving `tabindex`. Two 19 px footer links were the last sub-44 px links. The two
preference checkboxes on `account.html` were the last sub-44 px *controls*: they are now
`appearance:none` inputs with a 44 × 44 box and negative margins, painting the same 22 px
square through `::before`/`::after`, so the hit area is the input itself rather than only the
surrounding label. Asserted at both viewports: **no control under 44 × 44 on any of the six
pages** (the demo pill excluded — it is not part of the design).

**Fonts are inlined.** Instrument Serif and Nunito ship as `local()`-first base64 woff2 inside
each page, so the pages render identically offline, in a screenshot run and in a test that
blocks the network — and there is no metric shift when a webfont lands. Cost is noted below.

**The ghost row is darker.** Sandra called the italic `Anonymous` "a little faint": it moves
from `--ink-3` to `--ink-2`, and the pending name that replaces it is full `--ink` at weight
700 — readable at arm's length, still visibly not-yet-a-row inside its dashed container.

**`This week` exists, and the table says how many people are on it.** Dev asked for both.
`leaderboard.html` now runs a three-way tablist — Today / This week / All-time — and the board
header carries `214 players today` / `2,662 players this week` / `5,109 players all-time`
under the unit line, in every state (`counting players this week`, `player count unavailable`,
`0 players today`, and `no players ranked, ever` for the two games that keep no table). The
weekly rows are derived, not invented: each score sits 60 % of the way from today's board to
the all-time board, re-formatted in the game's own unit, so a week's table is better than a
day's and short of the record — which is what a week actually looks like.

### Motion spec

Every animation below has one property, a curve from the design-engineering tables, a
duration inside the budget for its element class, and a reduced-motion variant. Anything
that failed "should this animate at all" is not here: the game tiles' hover-grow is gone
(seen 100+ times a session, decoration), the leaderboard rows do not animate on tab change
(data you are reading should not move), and no keyboard-initiated action animates —
`Enter`/`Escape` to replay is instant.

| Motion | Purpose | Property | Curve | Duration | Interruption | Reduced motion |
|---|---|---|---|---|---|---|
| End card entrance (`.dlg`) | Prevent a jarring change — the card would otherwise teleport over the board | `opacity` + `transform: translateY(6px)` | `--ease-out` `cubic-bezier(.23,1,.32,1)` | 180 ms | Runs once; focus and `Enter` are live from frame one | No animation, card at rest |
| Distribution "you are here" marker | State indication — one draw-in aims the eye at your bin among 24 identical bars (Priya: "readable in the 2 seconds I have") | `transform: scaleY()`, origin bottom; the `YOU` flag fades in behind it | `--ease-out` | 220 ms @ 60 ms delay, flag 160 ms @ 200 ms — the whole draw-in is over at 360 ms | Replayed only when the marker actually moves (loading → loaded) | No draw, marker and flag at rest |
| Personal-best numeral (`end-returning`) | The one celebratory motion the shared contract allows, and only on a PB | `opacity` + `transform: translateY(10px)` | `--ease-out` | 380 ms @ 160 ms delay (sequenced after the card, never overlapping it) | Runs once | No rise, numeral at rest |
| Name line expand / collapse | Prevent a jarring change — panes swap inside a height that is already reserved | `opacity` + `transform: translateY(4px)` on the incoming pane only | `--ease-out` | 160 ms | CSS transition, so toggling open → not now → change retargets instead of restarting | Opacity only, 120 ms |
| Name saved | Feedback — the ghost row becomes a real row | `background-color` + `border-color` on the row | `ease` | 150 ms | n/a | Kept (colour aids comprehension) |
| `Link copied` | Feedback — confirm the string is on the clipboard | `opacity` | `--ease-out` | 160 ms in, auto-clear at 2.4 s | Timer is cleared and restarted on a repeat tap | Kept, 120 ms |
| Table tab switch (Today / This week / All-time) | Spatial consistency — one control with a pill that moves, not three that recolour | `transform: translateX()` on a single indicator | `--ease-in-out` `cubic-bezier(.77,0,.175,1)` | 200 ms | CSS transition, retargets mid-slide | Indicator jumps |
| Table + "where you sit" repaint on a tab or game switch | Prevent a jarring change — a whole table swapping its numbers in one frame reads as a glitch | `opacity` on the two panels only (the rows themselves never move — data you are reading does not slide) | `--ease-out` | 140 ms, fade-in only: the new content is correct before the first painted frame | CSS transition; a second switch retargets | No fade, instant swap |
| Name pane swap (open → saved → not now) | State indication — the ask answers you inside a height that is already reserved | `opacity` + `transform: translateY(4px)` on the incoming pane | `--ease-out` | 160 ms | CSS transition, retargets | Opacity only, 120 ms |
| Game switcher scroll | Spatial consistency — show which chip moved into view | `scrollTo({behavior})` | native | native | Native | `behavior:'auto'` |
| Button / chip / tile press | Feedback — the interface heard the tap | `transform: scale(.97)` (`.985` on full-width rows, `.96` on game tiles) | `--ease-out` | 140 ms release | State, not a keyframe | No scale |
| Switcher edge fades | State indication — "there is more that way" | `opacity` | `ease` | 150 ms | n/a | Kept |

Reduced motion is *gentler, not zero*: the blanket `transition-duration:.001ms` kill is gone.
Under `prefers-reduced-motion: reduce` transitions are restricted to `opacity`, colour,
`box-shadow` and `filter` at 120 ms, all keyframe animation is off, and every animated element
is authored so its **base CSS is the final state** — turning the animation off leaves the page
correct rather than blank.

## What's playful

Personality is in copy, typography and one component — never in decoration.

- **The distribution bar.** 24 muted bars, the bars you beat rendered a shade darker, your
  bin filled in accent, a hairline marker and a small `YOU` flag. It converts a bare number
  into a story and costs one extra aggregate from the RPC. It appears on `end-first`,
  `end-returning` and `leaderboard`, and it degrades to a flat muted placeholder (same
  height, no marker, hidden axis) while loading or when the table is unreachable.
- **A real rank next to the percentile** — `#21 of 214 today · #388 all-time` — because
  percentile-only annoys the competitive persona, and `▲ 3 places since last week`.
- **A six-run sparkline** on the returning end card: your last six perfect solves, with
  *"Down 22 seconds since August."*
- **The ghost row.** The collapsed name ask shows the row you'd occupy — `#37 · Anonymous ·
  0:41`, italic and dashed — and it fills in live as you type. Saving turns it solid.
- **The dry copy.** Twelve-ish lines written for this, including:
  - *"Eight small games and one very quiet table."*
  - *"You're on six of eight tables. Best placing today: #19 in Word Steps — which is 18 places off bragging and 109 places off silence."*
  - *"Rhea is still sitting on 0:09.4 like it's nothing. A problem for another evening."*
  - *"Nobody's on this table yet. Awkward. First name here gets bragging rights, and for a while, the whole page."*
  - *"Everything this site knows about you fits on one page."*
  - *"Changing it renames you on all six tables at once, past rows included. Nobody is notified, because nobody is watching that closely."*
  - *"Deleting removes your name, your eight bests and the streak… We cannot get them back afterwards, and neither, impressively, can you."*
  - *"Everyone solved the same puzzle today, which makes this the only genuinely fair table on the site."*
  - *"Two weeks shown. The record on this site is 61 days and belongs to someone who has never once told us their name."*
  - *"Boards are for fun — scores aren't verified. Everything here is typed into a browser by a person on a sofa, including, presumably, you."*
- **One delight per screen:** home — the `8 / 6 / 1 / 0` ledger facts strip; play — the
  stated par (`Optimal 8`) plus *"Miss it and nothing bad happens at all"*; end-first — the
  live ghost row; end-returning — the sparkline; leaderboard — the honest "no table, by
  design" state that shows your own private row instead; account — the streak dot strip.
- **One celebratory motion, total.** A 380 ms rise on the personal-best number in
  `end-returning`, CSS-only, gone under `prefers-reduced-motion`. No confetti anywhere. The
  rest of the motion in this version is feedback and state, never decoration — see the motion
  spec above.

## What keeps it stable

- **Everything dynamic has a reserved height, verified in the browser**, not eyeballed:
  the name ask block is **224 px in all four states** (open / saved / "not now" /
  collapsed-after-"not now"), and the whole `end-first` card is **717 px at 390 × 844 and
  727 px at 1280 × 800, identical across first-time / saved / not-now / loading / table-down**; the account name block 156 px in both states; the email block 390 px across
  idle / sending / sent / verified / failed; the leaderboard's "where you sit" panel
  244 px in every state; the table 672 px loaded and loading (empty/error add only the
  explanatory note). Expanding the name field moves nothing.
- **Real dialog semantics** on both end cards: `role="dialog" aria-modal="true"`,
  `aria-labelledby`/`aria-describedby`, focus moved to **Play again** on open, Escape
  closes, Tab is trapped in the card, and the game shell behind is `inert` +
  `aria-hidden`. (This is U3 in the current-state notes, fixed.)
- **Loading is never an empty box.** Ten skeleton rows at the real row height; a flat
  placeholder distribution; the rank badge becomes a `#--` skeleton chip. Empty and error
  render ten `—` placeholder rows so the page never advertises a void.
- **Theme:** `?theme=dark|light` is read before first paint by an inline `<head>` script
  (URL → `localStorage.theme` → OS). Every token is defined for light, for
  `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`,
  and again for `:root[data-theme="dark"]`. No layout differs between themes.
- **Mobile:** 16 px inputs (no iOS zoom), `autocomplete="nickname"` / `"email"`,
  `inputmode="email"`, `enterkeyhint`, 44 px minimum tap targets everywhere (including
  the tiny "Change" / "Not now" links), `100svh`, `viewport-fit=cover` +
  `env(safe-area-inset-bottom)`, and no horizontal scroll at 390 (checked
  programmatically on all six pages: `scrollWidth === clientWidth === 390`).
- **Numbers are tabular** — a `.num` class using the system mono stack with
  `font-variant-numeric: tabular-nums lining-nums`, so ranks, times and scores never
  reflow. Big result numerals use the display serif with tabular figures.
- `prefers-reduced-motion: reduce` turns off all keyframe animation and every transform-based
  transition, keeping only opacity and colour; nothing here only makes sense in motion.
- **44 px minimum tap targets, asserted** — a Playwright pass walks every `button`, `a[href]`,
  `input`, `[role=tab]` on all six pages at 390 × 844 and fails on anything whose effective
  target (the control, or the label that wraps it) is under 44 × 44. The demo pill is excluded:
  it is dev chrome, deliberately outside the design, and is instead asserted never to overlap
  a real control.

## Cost notes

- **Display font: Instrument Serif** (regular 15 kB + italic 16 kB, latin subset). It is used only for headlines, game names, and result
  numerals. Fallback stack is `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia,
  serif`, which is a real serif on every platform, so a failed font load degrades to a
  different serif rather than to Nunito. **This is the one added font and it is optional** —
  dropping it costs the version its editorial voice but nothing functional.
- **Body font: Nunito** (already self-hosted in the repo, 700/800 today; this design also
  uses 400/600, so shipping it would mean two more subset files, ~15 kB each, or switching
  to the variable face — the 39 kB latin variable face is what these dummies use).
- **In the dummies both faces are inlined as base64 woff2** with `local()` first, which adds
  ~72 kB to each HTML file (~94 kB on `home.html`, which is the only page using the serif
  italic). That is a prototype convenience so the pages render identically offline and in the
  screenshot/test runs — the real site would serve them as files and the per-page cost is the
  ~54 kB of woff2 above, cached across all eight games.
- **No images, no icons beyond four inline SVG strokes, no libraries.** The distribution
  bar is 24 `<i>` elements; the sparkline is one `<polyline>`. Total CSS+JS per page is
  well inside the §23 budgets.
- **Extra data the RPC would need** (today it returns one number):
  1. `rank` and `total` for a score, per game and per period — for `#21 of 214`.
  2. A percentile (derivable from 1, or returned directly).
  3. A coarse histogram — ~24 bucket counts per game/period, cacheable for minutes.
     This is the only genuinely new aggregate; everything else falls out of a ranked table.
  4. Top-10 rows (name, score, timestamp) for the table page.
  5. Optional: last week's rank for the `▲ 3 places` line.
  Plus the schema work the whole brief implies: a player row (`{id, name}`), a per-player
  score row rather than one global best, and a server-side name denylist.

## Known weaknesses

1. **It converts the least, on purpose.** The ask is one quiet line under a fold-ish part
   of the end card. Many players will finish, read the percentile, tap Play again, and
   never notice they could be named. That is the direction's stated trade, but if the goal
   is email volume this is the wrong version.
2. **The reserved ask block still shows its cost.** 220 px is exactly what the expanded form
   needs, so it cannot be trimmed, and the collapsed and saved states leave ~55 px of air
   inside it. The polish pass pinned the ghost row to the top and the trigger + note to the
   bottom, so the air now sits between two separate ideas instead of under a control and
   nothing moves between states — but it is air, and a denser direction would not have it.
3. **Warmth risk.** Hairlines, a serif and one accent can read as austere, especially in
   light mode where the palette is deliberately close to paper. The copy is carrying the
   personality almost alone; a reviewer who dislikes the writing will find the version cold.
4. ~~**The end card is tall.**~~ Fixed in the polish pass: `end-first` is 740 px and
   `end-returning` 751 px on a 390 × 844 phone, both single-screen with the buttons visible,
   and both fit 1280 × 800 as well.
5. **`play.html` shows Flip It as its real 5×5 Lights-Out board**, not the 4×4 memory grid
   the brief's parenthetical described — the registry says Flip It is Lights-Out, and the
   shell is what mattered. It carries a moves counter, a timer, a stated par, and the same
   identity chip + table link every game page would get.
6. **The demo pill still lands on content in the long-page screenshots.** It is
   `position: fixed` bottom-left as specified, so a *full-page* capture of `leaderboard` or
   `account` parks it over whatever sits at the first viewport's bottom edge. In an actual
   390 × 844 viewport it overlaps no control on any page — asserted — and on the end card the
   dialog layer reserves a strip for it. It is a dev tool, not part of the design.

## Files

| File | What it is |
|---|---|
| `home.html` | Masthead, dateline, hero, ledger facts strip, "Today on the tables" panel (the homepage board surface), the eight-game index with your best + rank + movement, honesty footer. Identity chip links to the account. |
| `play.html` | Generic game shell around Flip It mid-play: topbar (back / title / 3 icon buttons), a "ledger bar" carrying the identity chip, today's best and **The table →**, board, Moves / Time / Optimal stats, difficulty pills, the stated qualification rule, How to play, honesty line. Tiles and the counter are live. |
| `end-first.html` | Never-named player. Result → meaning → distribution → rank → *See the table* → the always-present "Add your name to the table" line (expands in place, pre-filled `Quiet Otter 42`) → Play again / Share. Saving writes `twb:player`. Email is deferred to the ledger with one line. Demo pill cycles first time / saved / not now / loading / table down. |
| `end-returning.html` | Named player, **no ask**. Personal-best result, percentile, distribution, `#21 today · #388 all-time · ▲ 3 places`, your row on the table (a link), a six-run sparkline, Play again / Share, "Posting as Nikhil · change". |
| `leaderboard.html` | Per-game tables with an 8-game switcher (registry order, per-game accent dot, "no table" chips), Today / All-time tabs, "where you sit" panel with the distribution, top 10 with quiet 1–3 badges, an "N rows between" divider and your pinned row, tie and qualification rules stated. Demo pill cycles loaded / loading / empty / error; Untangle and Doodle On have a real by-design no-table state. |
| `account.html` | Your ledger: editable name (reserved height), bests on all eight games with ranks, Word Steps streak strip, magic-link registration (field → **Send magic link** → "Check your inbox" → verified), two email preferences with the transactional one separated from the newsletter, download / sign out / delete. Demo pill cycles no email yet / link sent / verified / sending / send failed. |
| `shots/` | 24 PNGs — every page × {mobile 390×844, desktop 1280×800} × {light, dark}, from `research/tools/shoot.js`. |

### Copy contract

`Play again`, `Share`, `Link copied`, `Save name`, `Not now`, `Send magic link` are used
verbatim and identically on every screen. The honesty line — *"Boards are for fun — scores
aren't verified."* — appears on `play`, `end-returning`, `leaderboard`, `account` and the
homepage footer.

### Note on running the screenshots and the checks

```
node research/tools/shoot.cjs research/ux-versions/v3-ledger
```

`research/tools/shoot.cjs` is CommonJS while the repo's `package.json` sets
`"type": "module"`, hence the `.cjs` extension. Because the fonts are inlined, the run needs
no network and the `load` event never waits on Google Fonts.

The polish pass is covered by a Playwright script (kept in the session scratchpad, not in the
repo) that runs against `file://` URLs with `fonts.googleapis.com` / `fonts.gstatic.com`
aborted and asserts, at 390 × 844: no control under 44 × 44 on any of the six pages,
`scrollWidth === 390`, no console errors, the demo pill overlapping no control, the end card
fitting in 844 with both buttons visible, the ask block at exactly 220 px and `Play again` and
the ghost row not moving across all four ask states, focus landing on `Play again`, Escape
closing the dialog (and closing only the field when the field is open), `Share` writing the
share string to the clipboard with no layout shift, the tab indicator and roving tabindex, and
— under `prefers-reduced-motion` — every animation off with each element resting in its final
state. **53 assertions, all passing.**
