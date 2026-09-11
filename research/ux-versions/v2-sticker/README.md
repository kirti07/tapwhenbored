# V2 — `v2-sticker` · "Sticker Book"

## Concept (5 lines)
Every one of the eight games hands out exactly one sticker; finishing writes your result on it and you **sign it** with your name.
The ask is therefore framed as *signing your work*, not *entering a competition* — a name is all the wall needs, and the email is a separate, clearly-numbered second step ("keep your book if you switch phones").
Other people's signed stickers make **the wall**: a cross-game grid on the homepage, and a per-game ranked column of stickers on `leaderboard.html`.
`account.html` **is** the sticker book — 8 slots, 5 filled, 3 outlined and empty, plus the Word Steps streak and the magic-link upgrade sold as "save your book".
Warm paper in light, a dark album page with accent-tinted die-cut stickers in dark; collection, not ranking, is what pulls you back.

## What's playful
- **8 inline-SVG stickers**, one per game, flat and geometric, drawn in that game's registry accent (light + dark values both used). Defined once per file as `<symbol>`s and reused as icon chips, wall tiles, book slots, board rows and the end-card hero.
- **Fixed tilt**, never animated: `--rot` set per item from a deterministic list (±3° on square stickers, ±0.8° on wide board strips so rows never look broken).
- **Handwritten signatures.** Player names render in Caveat everywhere they appear *on* a sticker — the wall, the board rows, the book, the end card. Numbers never do.
- **One celebratory motion in the whole direction:** a 420 ms CSS `peel` on the newly earned sticker in the end card. Everything else that moves is functional and ≤200 ms — see the motion spec below.
- Copy carries the personality, the numbers stay literal: *"Three slots are still empty and they are being very quiet about it."*, *"Nobody has stuck anything up here yet — awkward."*, *"You're in the top ten. Don't get comfortable."*, *"No account needed. Ever."*

## What keeps it stable
- **Measured reserved heights, not guesses.** The end card is 804.5 px tall in all three states — first, saved, email-sent (measured in Chromium at 390×844, verified by an assertion); step 2 keeps a 218 px box in every state and the name-step button row keeps its 46 px even after saving (it swaps to a "Name saved in this browser" confirmation instead of disappearing). Every dialog fits its viewport without internal scrolling at both 390×844 and 1280×800.
- Step 2 keeps its 218 px box before the sticker is signed, filled by its heading, its one-line explanation and a dashed ghost of the field to come — so the reserved box is never an empty hole, the two-step shape is obvious at first paint, and only one `Not now` is ever on screen.
- Board window reserves the full 10-row height for `ok` and `loading` (identical skeleton rows), and releases it for empty / error / unranked so those states don't leave a void.
- Real dialog semantics: `role="dialog" aria-modal="true"`, `inert` on the game behind, focus moved to the primary button on load, Escape and scrim click close.
- Every sticker is a fixed-size chip in a grid; grids never reflow; a failed fetch degrades to "your own sticker" (error state on `leaderboard.html`).
- 16 px inputs with `autocomplete="nickname"/"email"`, `inputmode="email"`, `enterkeyhint`; 44 px minimum targets; `:focus-visible` on every control; `100svh` + `env(safe-area-inset-*)`; `tabular-nums` on every number.
- Themes: `?theme=dark|light` is read before first paint, with `prefers-color-scheme` **and** `html[data-theme]` both defined for every token. Verified: no horizontal scroll on any page at 390 in either theme.
- The name field sits on the sticker but is a **normal, level input** — the sticker in the end card is unrotated and the tilted "page" sits behind it.

## Cost notes
- **Fonts.** Nunito (already the site's font) at 500/700/800, plus **one display font: Caveat 600/700**, used only for signatures. Latin subset via Google Fonts ≈ **18–22 KB** extra woff2 plus one extra `fonts.gstatic.com` connection. Fallback stack `"Segoe Print", "Bradley Hand", ui-rounded, cursive` — if it fails the pages stay legible, just less charming. Self-hosting it alongside the existing Nunito files would remove the third-party hop.
- **Assets.** None. The 8 stickers are ~2.6 KB of inline SVG total, shared as `<symbol>`s; no images, no icon font, no JS libraries.
- **Aggregates the backend does not have today.** Today's schema stores one global best per game. This direction needs: per-player rows (name + client id), rank within a game/window, a player count per window, a cross-game "recent + best" feed for the homepage wall, a per-player bests map for the book, and a streak counter. That is a real schema change (a `scores` table with a player column and 2–3 RPC aggregates), not a rendering change.
- Percentile ("quicker than 86%") also needs a distribution query, not just a max.

## Polish pass (persona fixes + motion)

Driven by `research/personas/priya.md` and `aisha.md`. Verified with
`research/tools/shoot.cjs` and a Playwright assertion run at 390×844 in both themes.

### What changed
1. **Share is real.** `#shareBtn` on `end-first.html` and `end-returning.html` now composes a
   postable string and calls `navigator.share`, falling back to `navigator.clipboard.writeText`,
   falling back to a hidden-textarea `execCommand('copy')`. The string:
   `🟧 Flip It · 0:11.5 perfect · sticker earned — tapwhenbored.com/flip-it`
   The `Link copied` confirmation is an empty `role="status" aria-live="polite"` line that
   already occupies its 20px in the layout, so confirming shifts nothing; it fades out after 2.6s.
   (Was: a CSS class that revealed a static label and copied nothing — Aisha's worst moment.)
2. **Initial focus on `end-first` moved to `Play again`**, matching `end-returning`. An
   absent-minded Enter now replays instead of committing a name to the public wall. The name
   field is never auto-focused, so no keyboard pops on mobile. `enterkeyhint="done"` is now
   honoured — Enter *inside* the field saves and returns focus to `Play again`.
3. **The "SIGNED IN AS [name]" header chip is gone.** In its place: a 44×44 quiet identity
   chip — the player's initial on a tilted sticker square, `aria-label`led "Your sticker book —
   [name]" for screen readers, linking to `account.html`. No name is displayed in page chrome
   anywhere now; `account.html` is the one page that says who you are, which is where it belongs.
4. **One primary decision at a time on `end-first`.** Step 2's form (and its second `Not now`)
   is `display:none` until the sticker is signed; the step keeps its full 218px reserve and
   fills it with the heading, the one-line explanation and a dashed ghost of the field that is
   coming. Two `Not now` buttons are never on screen together — asserted in the test.
5. **End card trimmed and pinned.** Rhythm tightened (result/mean/earn/step/action margins,
   `.d-mean` reserve 42→40px, step-2 heading shortened to one line, mobile bottom padding
   46→40px) and `.bs-done` given a 48px floor so the signature slot is the same height signed
   or unsigned. Measured at 390×844: **804.5px in all three states** (first / saved / email
   sent) — previously 805.4 → 801.4, a visible 4px contraction under `Play again`, and it
   overflowed into an internal scroll at 830px. It now fits the viewport with no internal scroll.
6. **Every tap target is ≥44×44.** Fixed: home sort segments (36px), play difficulty pills and
   leaderboard tabs (38px), `Play` buttons on empty book slots (38px), the `All →` section link
   (32px wide), and every footer / end-card-footer link (18–20px tall). Email-preference
   checkboxes stay 22px but sit inside a ≥44px `<label>`, which is the real target.
7. **Caveat kept in its lane.** Signatures only, never a number, never below 20px (21/22/26/28/32px).
   On the dark album page it gets `-webkit-text-stroke:.3px` so the hairline script does not
   thin out against `#0f0e18` — same size, restored optical weight. Contrast is `--ink`
   `#f1ecdf` on `--card` `#1a1928` (≈14:1).
8. **Invisible details.** `touch-action:manipulation` and `-webkit-tap-highlight-color:transparent`
   on every pressable; every `:hover` transform now behind `@media (hover:hover) and (pointer:fine)`
   so a tap on a phone no longer sticks in a hover state; `:active` press feedback added to the
   secondary and ghost buttons, not just the primary.

### Motion spec
Five animations, all CSS (off the main thread), transform/opacity only.
`--ease-out: cubic-bezier(.23, 1, .32, 1)` is the one shared curve.

| Motion | Purpose | Property | Easing | Duration | Reduced motion |
|---|---|---|---|---|---|
| **End card entrance** (`.scrim`, `.dlg`) | Prevent a jarring appearance; put the card over the board | scrim `opacity`; card `opacity` + `scale(.97→1)`, origin centre (a modal is not trigger-anchored) | `--ease-out` | 160ms / 200ms | Opacity-only fade, 150ms — no scale |
| **Sticker peel-on** (`.bigstk`) | State indication: this sticker was just earned. Rare/first-finish tier, so the delight budget applies | `transform` (`rotateX(24deg) translateY(-8px) scale(.96)` → none) + `opacity` | `cubic-bezier(.2,1.1,.35,1)` — slight overshoot, the one playful curve | 420ms, 120ms delay so it lands behind the card entrance (was 580ms) | `peelfade`: opacity 200ms `--ease-out`, no movement |
| **Name-saved confirmation** (`.saved-row`, `.bs-done`) | State indication: the row the player just acted on is replaced in place | `opacity` only — the reserved height means nothing may move | `--ease-out` | 160ms, via `@starting-style` (no JS state, no keyframe) | `transition:none` — instant swap |
| **Tab / sort switch** (`.board`, `.wall`, and the pills) | Prevent a jarring wholesale content swap | content `opacity` 0→1; pill `background-color` + `color` | `--ease-out` / `ease` | 120ms content, 140ms pill | Content fade off (`.swapping{opacity:1}`); colour transition kept |
| **Button press** (`.btn`, `.card`) | Feedback: the paper button is pushed down onto its ink edge | `transform: translateY(1px)` + `box-shadow` 3px→1px | `--ease-out` | 120ms | `transition:none` on transform; press still lands instantly |

Interruption: everything except the two one-shot entrances is a CSS **transition**, so a fast
second tap retargets from the current value instead of restarting. The entrances are one-shot
on load and are cancelled outright by Escape / scrim click.

Removed by the "should this animate at all?" gate: nothing new was added to hover on touch,
and no motion was put on the theme toggle, the game switcher or the demo pill — all of them are
either frequently repeated or carry no state worth explaining. Sticker rotations remain static
per the direction brief. The skeleton `pulse` on loading rows stays (it is a loading affordance,
already reduced-motion gated).

### Verification
`node research/tools/shoot.cjs research/ux-versions/v2-sticker` — 24 PNGs, no console errors,
all read. Playwright asserts, both themes, 390×844, all passing:
no interactive element under 44×44 · `scrollWidth === 390` on all six pages · end-card height
identical before and after `Save name` (804.5 / 804.5) · exactly one visible `Not now` before and
after saving · Escape closes the dialog · focus lands on `Play again` on both end cards ·
`Share` writes the sticker string to the clipboard and the note reads `Link copied`.

## Known weaknesses
1. **Childishness is a live risk.** It's held off by geometric stickers, an editorial ink-on-paper button system and literal numbers — but the handwriting font is the single thing most likely to tip it, and it is also the least accessible type on the page. It is capped at ≥20 px and never used for a number, but a reviewer who dislikes it dislikes the whole direction.
2. **The collection only pays off if people come back.** Five of eight slots filled is motivating; one of eight on a first visit is not, and the email pitch ("keep your book") is only persuasive once the book is worth keeping. On a cold start this direction converts worse than a weekly table.
3. Two of the eight games (Untangle, Doodle On) have no ranked board, so their stickers appear on the wall but their board page is a polite explanation. Honest, but it makes the game switcher slightly uneven.
4. The tilted stickers cost vertical rhythm — the wall grid needs padding for the rotation, so it is a little less dense than a plain grid would be.
5. The "you" highlight and the destructive "Delete my data" button share the same coral; on a page that had both, that would need separating.
6. Board data varies only by names between Today and This week (all-time has its own faster column). Fine for a dummy, obviously not real.

## Files
```
home.html            homepage: book strip (identity + progress), 8-game shelf, the wall, honesty line
play.html            Flip It mid-play (working 5×5 lights-out), topbar wall pill + identity chip, side rail wall
end-first.html       end card, never-named player: result → meaning → sign the sticker → step 2 email → Play again / Share
end-returning.html   end card, returning named player: no ask, signed sticker + today's wall + Play again / Share
leaderboard.html     per-game wall: 8-sticker game switcher, Today/This week/All-time, top 10 + pinned you,
                     loading / empty / error / not-ranked states via the demo pill
account.html         the sticker book: name, 8 slots (5 earned / 3 outlined), Word Steps streak,
                     magic link (device-only / sent / saved), email prefs, sign out, delete
shots/               24 PNGs — 6 screens × {mobile 390, desktop 1280} × {light, dark}
```
Demo state cyclers (grey pill, bottom-left) on `end-first.html`, `leaderboard.html` and `account.html`.
`twb:player` is written to `localStorage` as `{name, id}` on Save name and read back by every page.
