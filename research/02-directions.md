# 02 — Design spec: four UX directions for leaderboards, name/email capture and registration

Decided by the orchestrator on 2026-09-05 from `00-current-state.md` and `01-research.md`.
Every build agent follows the **Shared contract** exactly and then its own **Direction** section.
The four versions differ in visual language, where the board lives, and how the ask is framed.
They do NOT differ in the flows, the screen list, or the stability rules — that is what makes them comparable.

## 1. Shared contract (all four versions)

### 1.1 Screens — fixed filenames, one self-contained HTML file each
| File | What it shows |
|---|---|
| `home.html` | Homepage: header, 8 game cards (titles/taglines from current-state §1), the version's leaderboard surface, an identity affordance (who you are / sign in), footer. |
| `play.html` | A game page mid-play, to show the shell around a game. Use **Flip It** (memory, 4×4 face-down cards, moves counter, timer) as the sample board; the shell must obviously be generic for all 8 games. Topbar carries the version's identity chip / board entry point. |
| `end-first.html` | End card for a player who has **never given a name**. Result → meaning (global best / percentile / rank) → name ask (pre-filled with a generated friendly name, editable) → then, as a separate step or separate line, the optional email ask with the direction's specific value pitch. Include Play again + Share. Show the success state reachable by clicking (inline JS). |
| `end-returning.html` | End card for a **returning, named** player. No ask at all. Result, placement, the direction's board surface, Play again, Share. |
| `leaderboard.html` | The per-game leaderboard page for Flip It, with a way to switch between all 8 games. Top 10 + "you" (pinned row if outside top 10). Rank badges for 1–3. Tabs per the direction (Today / This week / All-time as relevant). Loading, empty and error states must exist (a small "state" switcher in the corner is fine). |
| `account.html` | Soft account → registration. Shows: your name (editable), your best on each of the 8 games, Word Steps streak, email status. The register/claim flow is **magic link, no password**: email field → "check your inbox" sent state (reachable by clicking). Email preferences (per pitch), "sign out on this device", "delete my data". |

### 1.2 Flow rules (from research; non-negotiable)
1. **Name → board. Email → notifications. Never bundled.** Placing on the board requires only a name. Email is optional, has its own one-line consent, and skipping it is as prominent as accepting it.
2. **Meaning before identity.** The end card always shows the result and what it means (global best / rank / percentile) *before* any ask.
3. **One-time ask, site-wide.** The name is stored once (`localStorage` key `twb:player`, JSON `{name, id}`) and shared by all 8 games. A returning player never sees the name ask again. Pre-fill a generated name (e.g. "Quiet Otter 42") so a single tap is enough.
4. **Non-record scores still go on the board** (the board is per game, top 10 + you). Don't gate identity behind a high score; gate *celebration* behind it.
5. **Registration is magic-link only.** No passwords. It is pitched with loss aversion ("keep your bests / streak / name if you switch phones"), never with "create an account".
6. **Honesty line.** Scores are client-side and unverifiable. Somewhere small on the board: "Boards are for fun — scores aren't verified."
7. **Consistent copy.** Exactly: `Play again`, `Share`, `Link copied`, `Save name`, `Not now`, `Send magic link`. Same everywhere in a version.

### 1.3 Stability rules (why "really stable")
- End card is a real modal: `role="dialog" aria-modal="true"`, focus moves to the primary button, Escape closes, board behind gets `inert`.
- **Reserve heights.** Board windows, name step, email step and the result line have fixed min-heights so nothing shifts when data loads, when the ask appears, or when a success message replaces a form.
- No layout shift on theme switch. No content behind the iOS keyboard: inputs have `font-size:16px`+, `autocomplete="nickname"` / `"email"`, `inputmode="email"`, `enterkeyhint`.
- `100svh`, `env(safe-area-inset-*)`, `prefers-reduced-motion` (every animation has a reduced variant), visible `:focus-visible` on every control, 44px minimum tap targets.
- Motion budget: at most one celebratory motion, only on a personal record / top-3, ≤ 800 ms, CSS-only.
- Light and dark both first-class: `@media (prefers-color-scheme: dark)` **and** `html[data-theme="dark"]` override. Pages must read `?theme=dark|light` from the URL and set `document.documentElement.dataset.theme` before first paint (tiny inline script in `<head>`).

### 1.4 Technical rules for the dummies
- One HTML file per screen, inline CSS + JS, no build step, opens from `file://`. No external assets except Google Fonts. Nunito (the site's existing font) is the body font; a version may add **one** display font and must note it as a cost.
- Mobile-first at 390×844, must also look designed at 1280×800 (max content width, not just stretched). No horizontal scroll at 390.
- Reuse the current site's basics so it reads as *Tap When Bored*: the game list, taglines, per-game accent colors from current-state §2, the light `#f6f6fb` / dark `#0d0e1a` page grounds (a version may shift these slightly to fit its palette, but must stay light/dark).
- Mock data must be plausible: 8 games with their real units (`moves`, `marbles left`, `seconds`, `points`, etc., lowerIsBetter where the registry says so, see current-state §1), 10 distinct human-ish names, a "you" row.
- Include a tiny fixed corner "demo" pill on `end-first`, `leaderboard`, `account` that cycles states (first-time / saved / email-sent / loading / empty / error). Keep it visually separate from the design (grey, bottom-left, `.demo-bar`).
- Screenshot yourself with `node research/tools/shoot.cjs research/ux-versions/<folder>` and look at every PNG. Fix console errors, overflow, clipped text, illegible contrast. Then run it once more.
- Write `research/ux-versions/<folder>/README.md`: concept in 5 lines, what's playful, what keeps it stable, cost notes (fonts, assets, extra RPC aggregates needed), known weaknesses, and the file list.

## 2. Directions

### V1 — `v1-arcade` · "Arcade Cabinet"
**Concept.** The 45-year-old high-score table, done with care. Each game is a cabinet; the shell is a marquee (game accent color) around the board. On finish, the end card flips into a reward state: chunky display lettering, `NEW SCORE — ENTER NAME`, a blinking cursor, and the board filling the card. Name is a real nickname (up to 12 chars, *not* 3 initials — the research flagged initials as unaddressable) rendered in tabular/monospace so rows never reflow.
- **Board lives:** in the end card (full-bleed), and on an `/arcade` page (`leaderboard.html`) that shows all 8 cabinets' tables as a row of cabinets you can flip between.
- **Ask:** name on first finish inside the reward state. Email is a single quiet line under the board: *"Ping me when someone knocks me off"*.
- **Registration:** minimal. `account.html` is the "claim your name on this device" page with a magic link, plus bests per cabinet.
- **Playful:** the ritual, the marquee, rank medals, a one-shot pixel-sparkle on a top-3 (CSS only).
- **Stable:** fixed-width slots, monospace numbers, the reward state is a discrete screen with constant height. Blink must be ≤ 1 Hz and off under reduced motion.
- **Optional display font:** Press Start 2P or Silkscreen, headings only, small sizes, with a heavy Nunito fallback. Note the cost.
- **Risks to design against:** retro-masculine skew, unreadability of pixel type at small size, a wall of anonymous names.

### V2 — `v2-sticker` · "Sticker Book"
**Concept.** Warm, tactile, scrapbook-ish. Each of the 8 games has a sticker (inline SVG chip, ~64px, flat shapes, game accent). Finishing earns the sticker with your result written on it. The board is "the wall": a grid of other players' stickers, best and newest first, one tap deeper is the proper ranked table.
- **Board lives:** homepage "wall" (cross-game recent + best), and per game on `leaderboard.html` (the ranked table rendered as a column of stickers with rank numbers).
- **Ask:** *"Sign your sticker"* — the name field is on the sticker itself, pre-filled. Email is the second step: *"Keep your sticker book if you switch phones"*.
- **Registration:** soft account by default; `account.html` **is** the sticker book: 8 slots, earned stickers filled, empty slots outlined, name, streak, magic link sold as "save your book".
- **Playful:** collection instead of ranking, slightly rotated stickers (±3°, fixed per item, never animated), warm paper palette, handwritten-feeling but legible copy. One peel-on transform on a newly earned sticker.
- **Stable:** every sticker is a fixed-size chip; grids never reflow; a failed fetch degrades to "your own stickers".
- **Risks to design against:** reading as childish, 8 bespoke illustrations (keep them geometric), name field on an angled sticker must still be a normal, level input.

### V3 — `v3-ledger` · "Quiet Ledger"
**Concept.** NYT / Human Benchmark editorial. Almost no chrome. End card: one clean result line, one sentence of context (*"14 moves. Better than 78% of players today."*), a distribution bar with a "you are here" marker, and nothing else. The board is a typographic table on its own page. Personality is in copy, typography and one accent color.
- **Board lives:** `leaderboard.html` only, with Today / All-time tabs. The end card shows only *your* placement line and a text link "See the table".
- **Ask:** late and non-modal. The end card has a persistent, quiet footer line *"Add your name to the table"* that expands into a single field (reserved height). Email is offered only on `account.html`.
- **Registration:** the fullest of the four. `account.html` = your ledger: bests on all 8, Word Steps streak, magic link, email prefs, export/delete.
- **Playful (this version MUST still be a bit playful — the brief requires it):** dry wit in the copy (write 6+ real lines), the distribution bar, a tasteful numeral typeface treatment, a tiny "▲ 3 places since last week" hint. No confetti.
- **Stable:** by construction; nothing appears that wasn't in the layout; the ask line is always present so nothing pops.
- **Risks to design against:** feeling cold; lowest conversion; percentile-only can annoy the competitive persona — include an actual rank too.

### V4 — `v4-weekly` · "Weekly Table"
**Concept.** One component, everywhere: **this week's table**. Every end card shows a compact 5-row window — top 3, then you ± 1 — with "resets Sunday" and a countdown. Homepage carries a combined "this week" panel. The rhythm is weekly, so every board is always beatable. Include a seeded **"Par"** row (the maker's target score) so a board is never empty.
- **Board lives:** everywhere and small: 5-row window in `end-first`/`end-returning`, full weekly + all-time table on `leaderboard.html`, combined panel on `home.html`.
- **Ask:** one nickname field inline on first finish, remembered forever. Email pitch: *"We'll email you Sunday if you finish top 3"* — one transactional email a week, max.
- **Registration:** soft; `account.html` offers the magic link as "keep your name across games and devices", shows this week's position on every game and all-time bests.
- **Playful:** league drama — "2 moves off 3rd", promotion arrows, the countdown, a small crown on the week's leader. Motion: a single row-highlight pulse on your row, once.
- **Stable:** the window is exactly 5 rows tall in every state (loading skeleton rows, empty rows with "—", full rows). Numbers are tabular.
- **Risks to design against:** advertising emptiness (Par row + "3 players this week" honesty), league stress (calm palette, no red).

## 3. What the personas will judge (so design for it)
Priya (desktop, 3-minute gaps, wants no blocking), Marcus (Android, big targets, no keyboard surprises, no layout jump), Sandra (iPad, large text, streak matters, distrusts signup, hates motion), Dev (wants real ranks, stated rules, all-time board, will try to spoof), Aisha (iPhone dark mode, wants it to look great and a share string, no email nag on visit two). Full descriptions in `01-research.md` §7.
