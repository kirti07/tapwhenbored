# V1 — `v1-arcade` · "Arcade Cabinet"

## Concept in five lines

1. Every game is a **cabinet**: a coloured marquee with bulbs along the top, and a dark CRT screen underneath that holds the score table. Same shell, eight accents.
2. The high-score table is the reward, not a form. Finishing flips the end card into a **reward state** — chunky pixel lettering, your time, and the board with your row already in it, name slot blinking.
3. The ask is a **nickname up to 12 characters**, pre-filled, one tap to keep. Not three initials: the research flagged `AJK`/`XXX` boards as unaddressable and retro-male, so names are real, mixed-case and monospaced.
4. Email is one quiet line *after* the name lands: **"Ping me when someone knocks me off."** Never bundled, never before the result.
5. `leaderboard.html` is `/arcade` — a row of eight cabinets you flip between, each with Today / This week / All-time and a permanent "where you actually are" strip.

## What's playful

- The ritual: `NEW SCORE` on the marquee, a blinking block cursor in your row until you type, then the row fills in with your name and the cursor stops.
- Marquee bulbs (a repeating radial-gradient, static, zero JS) and per-game accent marquees — the homepage shelf reads as a row of machines.
- Rank medals 1–3 in pixel numerals; a `YOU` chip so your row survives greyscale and colour-blindness.
- One-shot CSS pixel sparkle around the result on a top-3 finish, 720 ms, `aria-hidden`, gone entirely under reduced motion.
- Copy with a pulse: "first one up gets the gold", "keep it or make it worse", "Nanna June is on 212. Nanna June is unwell.", "treat the top of any board as folklore".
- Two cabinets honestly labelled **score-free** (Untangle, Doodle On) with the reason, instead of pretending they rank.

## What keeps it stable

- **Every variable region is a fixed-height slot.** The name step, the email step and the "check your inbox" step are stacked in one CSS grid cell; the inactive ones are `visibility:hidden` + `inert`, so the slot is always as tall as its tallest state. `Play again` sits at the same pixel in all three. Same trick for the board's table / loading / empty / error states and for the account bests block — verified by screenshot: the page height is byte-identical across states.
- The board window is 5 rows in the end card, 10 + a fixed "your standing" strip on `/arcade`, in every state.
- End card is a real dialog: `role="dialog" aria-modal="true"`, focus lands on `Play again`, Escape closes it and hands focus to a "Show my result" button, the game behind is `inert`.
- Names and all numbers are monospace with `tabular-nums`, name column is width-capped and ellipsised, so no row ever reflows.
- Inputs are 16px (no iOS zoom), with `autocomplete="nickname"` / `"email"`, `inputmode`, `enterkeyhint`, `autocapitalize=off`. Every control is ≥44px. Visible `:focus-visible` ring everywhere. `role="status"` regions exist at load, not injected later.
- Light and dark are both authored: light vars on `:root`, dark via **both** `@media (prefers-color-scheme: dark)` and `html[data-theme="dark"]`, plus `?theme=dark|light` read in a `<head>` script before first paint. The theme toggle is real and persists to `localStorage`.
- Blink is 1.2 s (below 1 Hz) and disabled under `prefers-reduced-motion`, along with the sparkle and the skeleton pulse.
- No horizontal scroll at 390 on any page (checked with `scrollWidth === clientWidth`); designed max-widths at 1280, not stretched.

## Cost notes

- **Display font: Silkscreen** (SIL OFL 1.1), weights 400 + 700, used *only* for marquees, section eyebrows, medals, chips and the one big result number — never body copy, never below 9 px. Latin subset: **3.5 KB + 3.2 KB woff2**. Fallback stack is Nunito 700/800 → `ui-rounded`, so a failed font load degrades to the site's existing display face rather than Times.
- Body font is **Nunito** (already self-hosted on the real site). The dummies inline Nunito's latin variable woff2 (39 KB) plus the two Silkscreen files as base64 so each file renders correctly from `file://` with no network at all. That inlining is a *dummy-only* convenience — it costs ~62 KB per page here; production would keep Nunito self-hosted as today and add ~7 KB for Silkscreen.
- No images, no icon font: the 8 shelf glyphs, the theme toggle, the topbar icons and the play triangles are hand-written inline SVG (~200 bytes each).
- Numbers use the **system monospace stack** (`ui-monospace`) — no third webfont.
- **Backend it would need beyond today's single `submit_game_score` aggregate:** a `scores(game_slug, period, player_id, name, score, created_at)` table, and two read RPCs — `top_n(slug, period, limit)` and `my_rank(slug, period, player_id)` returning rank + total count (the "3rd out of 214" line and the pinned row both depend on that count). Names need a profanity/uniqueness pass on write. Nothing else on this design requires a new aggregate.

## Known weaknesses

1. **The reserved slots show as whitespace.** The end card's ask slot and the account page's claim/name blocks hold room for their tallest state, so the default view has visible dead space. It is the price of never moving `Play again`, but a reviewer will notice it before they notice why it's there.
2. **The dark CRT panel inside the light theme is a strong opinion.** It looks like a cabinet, but it is the one place where light mode carries a big dark block, and on a very bright screen it can read heavy.
3. **Pixel type has a floor.** Silkscreen is legible at 9–13 px on a 2× phone, but on a 1× low-DPI desktop the 9 px cabinet-tab labels are the first thing that would need bumping.
4. The email pitch does double duty (magic link = notification opt-in *and* device claim). It is stated plainly in the microcopy, but it is one idea doing two jobs and could be split if it tests badly.
5. `play.html` shows Flip It as its real Lights-Out 5×5 board rather than the spec's "4×4 face-down cards" shorthand, so the shell matches the shipped game.

## Files

| File | What it is |
|---|---|
| `home.html` | Shelf of 8 cabinets, "High score roll" attract panel (top of each of 5 boards), Player-1 identity card, intro, footer. |
| `play.html` | Flip It mid-play in the arcade shell: marquee band, ticker with your rank, 5×5 board (tiles actually flip), stats, levels, how-to, full cabinet board in the rail. |
| `end-first.html` | Reward state for a player with no name. Result → meaning → board with a blinking name slot → `Save name` / `Not now` → email line → `Send magic link` → sent. Demo pill cycles all three. |
| `end-returning.html` | Same card for a named player: result, placement with a "up two places" line, board with your row lit, `Play again` / `Share`. No ask. |
| `leaderboard.html` | `/arcade`. Eight cabinet tabs, Today / This week / All-time, top 10 + your standing, house rules, honesty line. Demo pill cycles board / outside-top-10 / loading / empty / error. |
| `account.html` | Player card: editable 12-char name, bests on all 8 cabinets, Word Steps streak, magic-link claim, email preferences, sign out, delete. Demo pill cycles saved / editing / email-sent / loading / no-scores / error. |
| `shots/` | 24 screenshots — 6 pages × mobile 390 / desktop 1280 × light / dark. |
