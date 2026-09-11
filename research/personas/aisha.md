# Persona walkthrough — Aisha

Aisha, 29, freelance designer. iPhone, dark mode always, one game before sleep, never
returns to the same game twice in a week. Cares about how it looks and whether the Share
button gives her something she'd actually post. Hates bright flashes, a light modal over
a dark page, and being asked for an email by a site she's used twice.

## Scores (0–5, higher is better)

| Criterion | V1 Arcade | V2 Sticker | V3 Ledger | V4 Weekly |
|---|---|---|---|---|
| Clarity | 4 | 4 | 4 | 4 |
| Friction | 4 | 4 | 5 | 4 |
| Trust | 4 | 4 | 5 | 4 |
| Playfulness | 3 | 4 | 3 | 3 |
| Stability | 5 | 5 | 5 | 4 |
| Would-return | 3 | 3 | 3 | 2 |
| Persona-fit | 3 | 2 | 2 | 3 |
| **Total** | **26** | **26** | **27** | **24** |

## V1 — Arcade Cabinet

Okay, this is cute, but it's giving little brother's Game Boy, not "phone I'd screenshot
for my Instagram close friends." The navy-and-yellow palette in dark mode (`home-mobile-dark.png`,
`end-first-mobile-dark.png`) actually holds up — no pure-black, no harsh white, the yellow
accent stays legible without turning into a flashlight. The blinking name-slot cursor
(`.cursor{animation:blink 1.2s steps(1,end) infinite}`, `v1-arcade/end-first.html:159`) is
a little much for 11pm in bed, but it's capped under 1Hz and dies under reduced-motion, so
fine. What actually won me over: the Share button composes a real line —
`"I cleared FLIP IT on Medium in 8 moves (optimal 8) — 00:14, 3rd today. tapwhenbored.com/flip-it/"`
(`end-first.html:453`) — via `navigator.share`/`clipboard.writeText` fallback
(`end-first.html:454–455`). That's a string I could actually post, even if the voice is a
bit more "gamer" than "designer."

- Would submit a name? **Y** — one tap keeps the generated `QuietOtter42`, no keyboard forced.
- Would give email? **N** — "ping me when knocked off" only matters if I'm coming back to defend a spot. I'm not.
- Would register? **N** — nothing here I'd miss on a new phone.
- Best moment: the Share button actually works and says something specific and true.
- Worst moment: the pixel/monospace "NEW SCORE" ritual and blinking cursor — reads retro-arcade-bro, not "looks great" to a designer's eye.
- Fixes:
  1. The three topbar icon buttons on `play.html`/`end-first.html` render at 42×42px — bump to the stated 44px minimum.
  2. The reserved ask-slot leaves visible dead whitespace in the default view (the README admits this) — `end-first-mobile-dark.png` shows the gap; tighten the min-height or fill it with something.
  3. Swap Silkscreen for the Nunito fallback at small sizes, or at least offer a non-pixel skin — the retro type is the single biggest thing standing between this and "looks great" for her.

## V2 — Sticker Book

Visually the warmest of the four in dark mode — the plum background with cream pill
buttons and the olive/maroon sticker chips (`home-mobile-dark.png`, `end-first-mobile-dark.png`)
is genuinely pretty, and the one-shot peel animation on a new sticker
(`.bigstk{animation:peel .58s cubic-bezier(.2,1.1,.35,1) both}`, `v2-sticker/end-first.html:299`,
gated under `prefers-reduced-motion:no-preference`) is the nicest single motion of the set.
But I tapped Share on `end-first.html` and `end-returning.html` and — nothing. The handler
(`end-first.html:569–570`) just adds a CSS class that reveals a static "Link copied" label;
there's no `navigator.share`, no `clipboard.writeText`, no generated string anywhere in
either file. I'd tap it, see "Link copied," paste into a text and get nothing. That's
worse than no Share button — it lies to me. And the whole pitch is "keep your sticker
book" — I don't have a book, I play once and leave.

- Would submit a name? **Y** — pre-filled on the sticker, one tap.
- Would give email? **N** — "keep your book if you switch phones" is only a real fear if the book matters to me, and 1-of-8 stickers on a first visit doesn't.
- Would register? **N** — same reason.
- Best moment: the sticker peel-in animation and the warm dark palette — the most "designed" single artifact of the four.
- Worst moment: pressing Share and discovering it does nothing at all.
- Fixes:
  1. Wire up the Share button (`#shareBtn`, `end-first.html:494` and `end-returning.html:511`) to actually compose a string and call `navigator.share`/`clipboard.writeText` — right now it's decorative.
  2. The Caveat handwriting font on my own signed name is cute once, less so as the *only* rendering of my name — offer a legible fallback weight, not just size ≥20px.
  3. The empty-slot state on a first visit ("1 of 8 stickers earned") reads thin — for a persona who won't be back, don't make the value prop depend on filling 7 more slots.

## V3 — Quiet Ledger

This is the one that actually looks like something I'd have designed. True near-black
(`home-mobile-dark.png`, `end-first-mobile-dark.png`), one teal accent, serif headline,
zero confetti — nothing flashes, nothing screams, and the copy has actual voice ("Rhea is
still sitting on 0:09.4 like it's nothing. A problem for another evening."). The single
motion — a 600ms opacity+translateY rise on the result number
(`@keyframes pbrise`, `v3-ledger/end-returning.html:253`) — is exactly the kind of
restrained thing I want at midnight. Then I hit Share and it's the same story as V2:
`#share` (`end-first.html:470`, `end-returning.html:383`) only toggles a "Link copied"
note into view — no `navigator.share`, no clipboard call, no string composed anywhere in
either file. For the persona who explicitly wants a share string, that's a real letdown
on the version that otherwise nails "looks great."

- Would submit a name? **Y** — the ghost-row/one-field ask is genuinely the least annoying of the four.
- Would give email? **N** — it's deferred to `account.html`, which I'll never open.
- Would register? **N** — nothing to protect that I'll come back for.
- Best moment: the palette and the one restrained rise animation — closest to how I'd actually want a dark-mode page to feel before sleep.
- Worst moment: Share does nothing, on the version I most wanted to post from.
- Fixes:
  1. Wire up `#share`/`#shareBtn` to actually generate and share/copy a real string (steal V1's pattern) — this is the one blocking bug for this persona.
  2. `end-first.html`'s dialog measures ~810px tall on a 390-wide viewport and scrolls internally — trim the copy or the distribution bar so a one-thumb-in-bed scroll isn't needed.
  3. The percentile/rank sentences ("18 places off bragging and 109 places off silence") are charming once, but stacked with the histogram and the ghost row it's a lot of reading right before sleep — cut one of the three.

## V4 — Weekly Table

Purple-on-navy is easy on the eyes at night (`home-mobile-dark.png`, `end-first-mobile-dark.png`),
and the Share button actually works — `"I cleared FLIP IT in 9 moves this week on Tap When
Bored. 3rd — come and take it."` (`v4-weekly/end-first.html:546`), same real
`navigator.share`/clipboard pattern as V1. That's a line with actual personality; I'd
consider posting it. But the whole frame is a countdown and a crown and "resets Sunday" —
league energy — right when I want to close my eyes, not get competitive. The card is also
the tightest of the four: the README says the first-run card is 791px of 796px available,
and I watched it grow further to 815px after Save name — not a jump I'd notice, but the
least room for error of the set.

- Would submit a name? **Y** — one nickname field, remembered forever, no friction.
- Would give email? **N** — "we'll email Sunday if you finish top 3" assumes I'm still playing Flip It next week. I won't be.
- Would register? **N** — "keep your name across games and devices" isn't a fear I have.
- Best moment: the Share string has real voice and I'd actually post it.
- Worst moment: the countdown-timer/crown competitive framing at the exact moment I want the app to wind down, not gear up.
- Fixes:
  1. Multiple controls sit under the 44px minimum: the three topbar icon buttons (42×42), the Easy/Medium/Hard pills (40px tall), and the "‹ Games" back link (32px tall) on `play-mobile-dark.png`/`end-first-mobile-dark.png` — bump all to 44px.
  2. The end card grows ~24px between the ask and saved states — give the name-ask block a fixed min-height so `Play again`/`Share` don't shift position at all.
  3. Drop or soften the countdown/crown drama on the end card for a first-time, once-a-week player — it's aimed at Dev/competitive players, not her.

## Ranking

1. **V3 — Quiet Ledger.** The only one that actually looks like something a designer would sign off on in dark mode — restrained, no flashes, one tasteful motion — undercut only by a Share button that does nothing.
2. **V1 — Arcade Cabinet.** Real, quotable Share string and a dark palette that holds up, but the pixel-cabinet skin reads more gamer than designer.
3. **V4 — Weekly Table.** Also has a working, characterful Share string, but the weekly countdown/crown framing fights the mood of a once-before-bed player, and it has the most small tap targets.
4. **V2 — Sticker Book.** Prettiest single animation and palette, but the Share button is fake and the entire pitch (collect, keep the book) depends on a return visit this persona has told us she won't make.

## If you combine

For her ideal #1 (V3's look), she'd steal:
- **V1's working Share mechanism** (`navigator.share`/`clipboard.writeText` composing a real per-run string) — V3 has the best copy voice to put into that string, it just needs to actually fire.
- **V4's specific, personality-forward share copy** ("come and take it") as the tone to write V3's share string in, once it's wired up — proof that a quotable line doesn't need confetti to back it.
- **V2's one-shot peel/earn animation weight** — not the sticker itself, just the quality bar for "one motion that feels considered" — as a model for any future motion V3 adds beyond the current 600ms number rise.
