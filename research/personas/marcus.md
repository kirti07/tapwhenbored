# Marcus, 41, warehouse shift supervisor

Android phone, gloves half the time, cracked screen, plays on breaks, light theme.
Wants: big tap targets, no login, resumes instantly, no keyboard popping up out of nowhere,
no layout jump. Annoyed by: tiny "no thanks" links, keyboard surprises, boards that shift under him.

## Scores (0–5, higher = better)

| Criterion | V1 Arcade | V2 Sticker | V3 Ledger | V4 Weekly |
|---|---|---|---|---|
| Clarity | 4 | 4 | 3 | 5 |
| Friction | 3 | 4 | 2 | 4 |
| Trust | 3 | 4 | 4 | 4 |
| Playfulness | 4 | 5 | 3 | 4 |
| Stability | 4 | 4 | 5 | 4 |
| Would-return | 4 | 4 | 3 | 5 |
| Persona-fit | 3 | 3 | 2 | 4 |
| **Total (/35)** | **25** | **28** | **22** | **30** |

## Ranking

1. **V4 Weekly — 30/35.** Biggest, boldest tap targets in the set, the name field is visible with zero extra taps, and "one field, once, no account, no email, nothing to confirm" is exactly Marcus's language. Docked only for a measured ~24px card-height jump right after Save.
2. **V2 Sticker — 28/35.** Warm, big touch targets, nothing blocks replay — but stacks a name ask and an email ask on the same first finish, which is more to parse on a two-minute break than Marcus wants.
3. **V1 Arcade — 25/35.** Bold and legible at a glance, but several icon buttons sit at 42×42 (just under the 44px line) and the name field showing "0 characters left" reads like something's broken.
4. **V3 Ledger — 22/35.** The most measurably stable of the four (zero layout shift, biggest raw button sizes) but hides the name field behind an extra "+" tap and leans on small serif body text — wrong shape for a guy reading fast in gloves.

---

## V1 — Arcade Cabinet

Big orange marquee, chunky blocky numbers — I can read "00:14" from across the break room, that part's fine. The high-score roll on the homepage tells me what this is in one glance, no reading required. Card flips to a "NEW SCORE" screen when I finish, name's already filled in with some `QuietOtter42` gamertag nonsense, and there's a "Save name" button I can just mash. But the field says "0 characters left" next to it, and that looked like an error to me, not a feature — made me hesitate before tapping Save. The little icon buttons up top (theme toggle, share icons) are the kind of tiny circle I miss twice with a glove on. Overall it's a fun retro board, but it's built for someone who wants to read a scoreboard, not someone who wants a single big button.

- **Would submit a name? Y** — it's prefilled and Save name is big; I'd tap it without thinking.
- **Would give email? Y, barely** — the "ping me when someone knocks me off" line is low-pressure and skippable, but I'd probably skip it on a first visit.
- **Would register? N** — nothing here asks hard for it, which is right; I wouldn't seek it out either.
- **Best moment:** the reward-screen flip with the board built right in — I see exactly where I landed without a second tap. (`end-first-mobile-light.png`)
- **Worst moment:** the "0 characters left" counter next to the name field on first finish — reads like a form error, not a feature. (`end-first-mobile-light.png`)
- **Three fixes:**
  1. Name input on `end-first.html` — drop or hide the "N characters left" counter unless the player is actively typing near the limit; showing "0 left" on a prefilled name looks broken.
  2. Icon-only buttons (theme toggle, share icon) on `home.html`/`play.html` — bump to 44×44 minimum; measured 42×42, right under the line gloves need.
  3. Toggle switches on `account.html` — measured 22×22; wrap the whole row as the tap target, not just the switch itself.

**Measured:** small (<44px) interactive elements — home 5, play 5, end-first 9, end-returning 4, leaderboard 8, account 11. No `scrollWidth` overflow at 390px on any page. `document.activeElement` was never an input on load (no keyboard surprise). End-first card height: 733px before Save name, 733px after (0px shift).

---

## V2 — Sticker Book

Cute — a bit too cute for a warehouse break, but I'll give it this: nothing here made me hunt for a button. "Cleared! Perfect" is unmissable, my time's in giant type, and Save name / Not now are two big pills side by side, no guessing. What slows me down is that right under the name box there's already a second ask for my email, with its own field and its own two buttons, all visible at once on the first finish. That's four buttons and two fields staring at me before I've even decided if I want to play again. On a five-minute break I want one decision, not two. The sticker-wall leaderboard is a nice touch and easy to scan.

- **Would submit a name? Y** — Save name is big and obvious, first thing I'd tap.
- **Would give email? N, not on visit one** — it's right there under the name ask, unbundled and skippable, but seeing both forms stacked at once makes me want to close the whole thing rather than read either.
- **Would register? N** — I'd wait until I'd played a few times, not on the first finish.
- **Best moment:** "Cleared!" plus the big perfect-time number — no ambiguity about how I did. (`end-first-mobile-light.png`)
- **Worst moment:** two full forms (name + email) stacked on the very first finish — more to read than a break allows. (`end-first-mobile-light.png`)
- **Three fixes:**
  1. `end-first.html` — collapse the email ask until *after* the name is saved (sequential, not simultaneous), so only one decision is on screen at a time.
  2. "Best today" / "Just added" filter chips on `home.html` — measured 36px tall, under the 44px line; grow the tap area.
  3. `account.html` "Play" links — measured 40px tall; bump to 44px so the row is comfortably tappable, not just the icon.

**Measured:** small elements — home 4, play 4, end-first 4, end-returning 2, leaderboard 9, account 10. No horizontal overflow at 390px on any page. No input auto-focused on load anywhere. End-first card height: 805px before Save name, 801px after (−4px, a slight shrink, not a jump).

---

## V3 — Quiet Ledger

This one reads like a newspaper, and that's the problem for me. Small serif type, thin grey rules, a paragraph of context before I even get to the number — I'm squinting at this through a cracked screen on a ten-minute break, not settling in with coffee. The "Add your name to the table" line doesn't even have a field on it — I have to tap a little "+" first, *then* the name box shows up, *then* I tap Save. That's three taps for something that should be one, and it's exactly the kind of "wait, what do I do here" moment that annoys me. Credit where due: nothing on this page moves or jumps, ever — I measured it, the card doesn't budge a pixel when I expand the form or save. But stillness isn't the same as easy.

- **Would submit a name? Y, eventually** — the copy ("one field, once, for all eight games") is honest, but I'd have to notice the "+" is tappable first.
- **Would give email? N** — good, it doesn't even try on first finish; email only shows up on the account page.
- **Would register? N** — the ledger metaphor (bests, streak, export/delete) is thorough but reads like signing up for something, even though it isn't.
- **Best moment:** the honesty line and the distribution bar — I instantly know where I stand without a leaderboard scroll. (`end-first-mobile-light.png`)
- **Worst moment:** the name field is hidden behind a "+" toggle — an extra tap for the one thing every version claims is "one tap." (`end-first-mobile-light.png`)
- **Three fixes:**
  1. `end-first.html` "Add your name to the table" — show the name field open by default (or at minimum make the whole row, not a small "+", the expand target) so it's genuinely one tap to Save, matching the other three versions.
  2. Body copy across `home.html`/`end-first.html` — the serif at current size is a lot of reading for a glance-and-go player; bump base size or shorten the paragraphs.
  3. `home.html` — no big "start a game" affordance is visible above the fold beyond text links; needs a clearly primary, large first action.

**Measured:** small elements — home 0, play 0, end-first 1 (a demo-only control, not real UI), end-returning 2, leaderboard 3, account 3 — the lowest count of the four, and both the "Add your name" toggle (316×48) and "Save name" (154×48) are comfortably over 44px once expanded. No horizontal overflow. No input auto-focused on load. Card height: 914px before expanding the ask, 914px after expanding, 914px after Save (0px shift throughout — confirmed by a second, targeted run that actually drove the two-step flow).

---

## V4 — Weekly Table

This is the one I'd actually want on my phone. Big number, big card, and the name box is just *there* — no toggle, no second tap, I see "Quiet Otter 42" already sitting in the field and a "Save name" button next to a "Not now" that's just as big. "Name only. No account, no email, nothing to confirm" — that's the whole pitch and it's the truth. The weekly reset with "2 moves off 3rd" and a countdown makes it feel like there's always a reason to come back on my next break, not a leaderboard I've already lost to strangers who've been playing since day one. Only ding: I watched the card grow by about 24 pixels right when I tap Save — small, but it's the exact kind of jump I said I hate, happening at the exact moment I take the one action every version wants me to take.

- **Would submit a name? Y, immediately** — visible field, no hunting, biggest Save button of the four.
- **Would give email? Maybe** — "we'll email you Sunday if you finish top 3" is a concrete, bounded ask; more likely than the other three.
- **Would register? N, not right away** — but the magic-link pitch ("keep your name across games and devices") is the clearest, least sign-up-y of the bunch.
- **Best moment:** the name field open and ready with Save name / Not now both full-size, no toggle in the way. (`end-first-mobile-light.png`)
- **Worst moment:** the measured ~24px card growth right after tapping Save name — the one moment this version should be rock-solid and it isn't quite. (`end-first-mobile-light.png`)
- **Three fixes:**
  1. `end-first.html` — the reserved `.d-ask` height (172px in CSS) is shorter than the actual "Saved. You're 5th this week as…" confirmation line; increase the reserved height so the card doesn't grow after Save.
  2. Icon-only nav buttons on `play.html`/`end-first.html`/`end-returning.html` — measured 42×42, under 44px; a few pixels short of the persona's minimum.
  3. `leaderboard.html` "full" toggle button — measured 31×24, well under 44px; enlarge or merge into an adjacent larger control.

**Measured:** small elements — home 1, play 7, end-first 14, end-returning 8, leaderboard 8, account 8 (mostly the 42×42 icon buttons repeated across pages, and small in-table state chips). No horizontal overflow at 390px on any page. No input auto-focused on load. End-first card height: 791px before Save name, 815px after (+24px shift — the one real layout jump found across all four versions' end-first screens).

---

## If you combine

For Marcus's #1 (V4 Weekly), steal:
1. **V3's reserved-height discipline** — V3 measured a genuine 0px shift through its whole ask flow; apply that same reserved-height rigor to V4's `.d-ask` confirmation state so Save name never grows the card.
2. **V1's fully-visible, always-expanded name field is already right in V4 — keep it, and never adopt V3's "+" toggle pattern**, which added a tap for zero benefit on the one interaction every persona report will call out.
3. **V2's plain-language reassurance line** ("no password, no newsletter") is close to V4's, but V4's "Name only. No account, no email, nothing to confirm" is the tightest of the four — nothing to steal here, just don't regress it.
