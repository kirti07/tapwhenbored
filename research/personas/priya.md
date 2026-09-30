# Persona walkthrough: Priya

Priya, 34, product manager. Desktop Chrome, light theme, five tabs open, three-minute
gaps between meetings. Plays 15-puzzle and untangle to reset her head; wants instant
load, no sound, closable in one keystroke, and a number that tells her if she's
improving. Annoyed by: anything that must be dismissed before she can play again, and
any hint a colleague could see her name.

Tested at 1280×800, light theme, via the `*-desktop-light.png` shots for all six
screens × four versions, plus a Playwright pass (`priya-test.cjs`, `priya-test2.cjs`,
`priya-height2.cjs`, `priya-mobile-check.cjs` in the scratchpad) checking: initial
keyboard focus on load, whether Enter on load replays or commits a name, end-card
height before/after saving a name, tab order, Escape behavior, and privacy copy. Dark
theme and 390px mobile were spot-checked for breakage (none found — no horizontal
overflow, dark palettes hold up).

## Scores (0–5)

| Criterion | V1 Arcade | V2 Sticker | V3 Ledger | V4 Weekly |
|---|---|---|---|---|
| Clarity | 4 | 3 | 5 | 4 |
| Friction | 4 | 3 | 5 | 3 |
| Trust | 3 | 3 | 5 | 4 |
| Playfulness | 4 | 4 | 3 | 3 |
| Stability | 5 | 4 | 5 | 3 |
| Would-return | 3 | 3 | 4 | 4 |
| Persona-fit | 4 | 3 | 5 | 3 |
| **Total /35** | **27** | **23** | **32** | **24** |

## V1 — Arcade Cabinet

This is the one that gets out of my way fastest. The board just appears in the
`Flip It` end card (`end-first-desktop-light.png`) — result, then a live high-score
roll with my row already sitting at #3 as "enter name," then the name field below it.
I don't have to do anything to see where I landed. Checked the focus: on load, focus
is already on **Play again** (confirmed via source — `first.focus({preventScroll:true})`
targets `#primary`, which is the Play again button on `end-first.html`), so if I just
hit Enter out of habit, I replay immediately and stay an anonymous "enter name" row —
never blocked, never nagged. The pixel font is legible enough at these sizes but it's
a little "gamer," not really my vibe, and the monospace high-score table reads a bit
retro-masculine like the direction brief itself warned. On return visit
(`end-returning-desktop-light.png`) there's zero ask — just result, table, Play again.
One real gripe: the "Not now" button on the email line measures 55×32px — under the
44px minimum — and would be a bad target on a trackpad if I were less precise. Escape
correctly closes the reward overlay and returns focus to a "Show my result" reopen
button (checked in DOM: `close()` sets `re.focus()`), not a page navigation.

- Would submit a name? **Borderline yes** — it's genuinely optional and never in my way, but I'd probably skip it in a 3-minute gap and let it ride as "enter name."
- Would give email? **No** — "ping me when someone knocks me off" is a fine pitch but I don't want an email relationship with a tap game.
- Would register? **No** — nothing forces it and the value (reclaim initials on new device) doesn't matter to me.
- Best moment: focus lands on Play again by default — Enter replays with zero interaction needed.
- Worst moment: the reward-state marquee flip is a full-card takeover; it's not blocking, but it is louder than my "reset my head in 3 minutes" mood wants.
- Fixes: (1) `end-first.html` "Not now" button — bump to 44px min height (currently 32px). (2) The monospace name column in the high-score roll on `home.html`/`leaderboard.html` reads more masculine-retro than the tone I'd want on a work laptop; a slightly warmer typeface would help without losing the arcade idea. (3) Tone down the marquee flash animation duration further for reduced-motion users — I didn't measure it but it's the busiest transition of the four.

## V2 — Sticker Book

Homepage (`home-desktop-light.png`) is warm and readable, but "SIGNED IN AS Quiet
Otter 42" sits permanently in the header on every page — home, play, leaderboard,
account — in a way none of the other three versions do. That's the one detail that
would make me pause before playing on a work machine: it's not my real name today,
but the pattern of a persistent "signed in as [name]" chip is exactly the shape of
thing that makes me check who's walking past my screen. On `end-first.html`, initial
keyboard focus goes to **Save name**, not Play again (verified: `saveBtn.focus(...)`
runs unconditionally on load) — so an absent-minded Enter-press *commits* my
pre-filled nickname to the public "wall" rather than skipping it. That's a real
behavioral difference from the other three, and it's the wrong default for someone
who wants an escape hatch, not a commit button, under her thumb. The end-card height
also shifts slightly after saving (750.0px → 746.0px, a 4px contraction) — small, but
it's not the "reserve the space" discipline the other versions show. On
`leaderboard.html` the wall shows real-looking handwritten names ("Maya P.", "Bex",
"Tomás R.") next to numbers — collecting is a nice reframe, but it makes the "who
sees this" question more vivid, not less.

- Would submit a name? **Yes, reluctantly** — the pre-fill is nice, but I'd double check I'm not accidentally hitting Enter into it.
- Would give email? **No** — "keep your sticker book if you switch phones" doesn't apply to a game I play in a 3-minute gap between meetings on the same laptop.
- Would register? **No.**
- Best moment: the sticker-earned confetto-free "peel" concept is genuinely charming and the wall's handwriting motif is the most visually distinctive of the four.
- Worst moment: default keyboard focus on first finish lands on "Save name," so Enter commits identity instead of dismissing it — the opposite of what I want in a hurry.
- Fixes: (1) `end-first.html` — move initial focus to Play again (or at minimum "Not now"), matching how `end-returning.html` already does it (`againBtn.focus(...)` there). (2) Drop or shrink the persistent "SIGNED IN AS [name]" header chip — a small avatar/initial like V3's "N" is plenty and reads less like an account. (3) Fix the 4px height contraction between ask and saved state in `end-first.html` so Play again doesn't visibly nudge.

## V3 — Quiet Ledger

This is the one built for exactly my three-minute gap. `home.html` is a clean
editorial page — no boards shouting at me, just "eight small games and one very quiet
table." `end-first.html` shows the result and a percentile-style distribution bar
*before* any ask at all (`Faster than 62% of today's perfect solves.`), and the name
field is a collapsed "+ Add your name to the table" line I never have to touch.
Verified in the DOM: initial focus goes to **Play again** even on the very first end
card (`document.getElementById('again').focus(...)` runs unconditionally), and
pressing Enter immediately does replay — it navigates straight to `play.html`.
Escape does the same thing (`if(e.key==='Escape'){ location.href='play.html'; }`),
which is the cleanest "one keystroke closes it" behavior of the four. The only wrinkle:
the account page's default player name in the mock data is **"Nikhil"** — a real,
plausible first name — rather than a generated handle like "Quiet Otter 42." For
someone specifically worried about a colleague seeing her name on a board, a system
that defaults to a name-shaped name is a worse starting point than one that visibly
defaults to nonsense; it invites "maybe I should type my actual name" instead of
signaling "everyone here is a fake handle." Small thing, but it cuts against this
version's own trust pitch ("there is nothing here worth stealing"). Also amusing/
slightly unsettling: the mock leaderboard data on `leaderboard.html` includes a row
literally named "Priya S." at #10 — coincidental test data, not a real bug, but it's
a good illustration of exactly the scenario the persona is wary of.

- Would submit a name? **Yes** — genuinely lowest-friction of the four; I could ignore it forever and lose nothing, so trying it costs nothing either.
- Would give email? **No, but I'd consider it later** — the ledger's "everything on one page" framing is the most trustworthy pitch, and it's honestly offered only on `account.html`, never as an end-card interruption.
- Would register? **Maybe, eventually** — this is the only version where "your ledger" reads like something worth keeping, precisely because it asks for so little.
- Best moment: Enter (or Escape) on the very first end card replays instantly — no ask ever stands between me and the next attempt.
- Worst moment: the default mock name "Nikhil" undercuts the "you're anonymous by default" signal the copy is trying to send.
- Fixes: (1) Default the pre-filled name to an obviously-fake generated handle (as V1/V2/V4 do), not a name-shaped name. (2) The distribution histogram is genuinely useful, but at a glance the "You" marker sits mid-pack in a wall of grey bars — a touch more contrast on the "you" bar would make the placement readable in the 2 seconds I have for it. (3) Nothing else — this is close to ship-ready for a desktop, minimal-time persona.

## V4 — Weekly Table

The always-visible 5-row "this week" panel on `home.html` is genuinely useful — I can
see my standing across all 8 games without clicking anything, and "1 point off 6th —
one more board" gives me a concrete, non-annoying reason to come back. On
`end-first.html`, focus correctly lands on Play again on load (verified,
`againBtn.focus(...)`), so Enter replays immediately here too. But the ask isn't as
clean as V1/V3: saving a name doesn't just confirm — it *simultaneously* reveals a
second, stacked email pitch ("We'll email you Sunday if you finish top 3") in the same
card. I measured this directly: the dialog grows from 441.8px to 465.8px (+24px) the
moment I hit Save name (`v4-before.png` vs `v4-after.png` in the scratchpad), and
"Play again" visibly shifts down. It's not blocking — the button is still one click
away — but it's exactly the kind of unrequested reflow that would catch my eye
mid-tap, and it violates the brief's own "reserve the height" rule. The countdown
("resets in 0d 11h 56m") is a nice touch but also a small tax on attention I don't
need every single game.

- Would submit a name? **Yes** — one field, remembered forever, and the weekly framing ("1 move off 3rd") is motivating without being loud.
- Would give email? **No** — the Sunday top-3 email is the best-argued pitch of the four researched options, but it still doesn't match "I have three minutes, I don't want a relationship with this site."
- Would register? **No**, though I'd consider it if I ever placed top 3 and wanted the email to actually land somewhere real.
- Best moment: the always-on "this week" panel on the homepage answers "am I improving" without a click.
- Worst moment: the end card visibly grows 24px and Play again shifts position the instant I save my name — the one moment in this whole exercise where something moved when I didn't ask it to.
- Fixes: (1) Reserve the email-step's height in `end-first.html` from first paint (an empty/collapsed row that expands into itself, not a new block that pushes content), so saving a name doesn't move Play again. (2) Consider collapsing the countdown timer to something quieter on the end card (it's already on `play.html`'s topbar; showing it twice per screen is redundant for a 3-minute session). (3) Nothing structural — the weekly-window concept itself tests well for this persona.

## Ranking

1. **V3 — Quiet Ledger.** Meaning before identity, zero-friction Enter-to-replay from the very first finish, and the calmest homepage of the four — this is what "closable in one keystroke" looks like when someone actually built for it.
2. **V1 — Arcade Cabinet.** Nearly as fast to get out of the way (focus defaults to Play again, no forced ask), loses points only on tone (retro-masculine skew) and one under-sized "Not now" target.
3. **V4 — Weekly Table.** The homepage standing panel is the single most useful *feature* for this persona, but the end-card layout shift after saving a name is a real, measured stability bug that directly hits her "nothing should move" requirement.
4. **V2 — Sticker Book.** Warmest visual language, but the persistent "SIGNED IN AS" header chip and the default focus landing on "Save name" (not "skip") are the two things most likely to make a privacy-conscious, time-pressed user hesitate.

## If you combine

Priya's #1 (V3) would steal:
- **V4's always-visible homepage standing panel** ("6th this week · 2 left") — V3's homepage table is good but static; a persistent "where do I stand" line would answer her "am I improving" question even faster.
- **V1/V2/V4's obviously-fake default name** ("Quiet Otter 42") instead of V3's name-shaped "Nikhil" — the single cheapest fix to make the anonymity promise visible at a glance, not just written in the copy.
