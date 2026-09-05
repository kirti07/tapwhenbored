# Sandra — 58, retired teacher. iPad, evenings, light theme. Word Steps daily, 40-day streak.
Cares about: large legible text, a streak that never breaks, knowing her email won't be sold. Hates confetti/motion, small fonts, anything that looks like a signup.
Method: 820-ish viewport reasoning from the desktop and mobile captures, `measure.cjs` with `reducedMotion: reduce` (smallest font, elements still carrying animation/transition durations, presence of "email"/"sign in"/"streak" per page). Report written by the orchestrator after the persona agent was lost to network drops.

## Scores
| Criterion | V1 Arcade | V2 Sticker | V3 Ledger | V4 Weekly |
|---|---|---|---|---|
| Clarity | 3 | 4 | 5 | 4 |
| Friction | 3 | 3 | 5 | 4 |
| Trust | 3 | 3 | 5 | 4 |
| Playfulness | 2 | 4 | 3 | 3 |
| Stability | 3 | 4 | 5 | 3 |
| Would-return | 2 | 3 | 4 | 3 |
| Persona-fit | 2 | 3 | 5 | 3 |
| **Total** | **18** | **24** | **32** | **24** |

## Measurements
| | V1 | V2 | V3 | V4 |
|---|---|---|---|---|
| Smallest text on end card | 8.5px | 10px | 11px | 10.5px |
| Elements with a non-zero animation/transition under reduced motion (end-first) | 180 | 0 | 127 | 0 |
| "email" mentioned on end-first | yes (quiet line) | yes (step 2 box) | yes (in the "no email" reassurance only) | yes (pitch after name) |
| "email" / sign-in words on end-returning | none | none | none | none |
| Streak named on account | yes | yes | yes | yes |

Note on the reduced-motion count: it counts declared `transition` durations too, not only running animations. V1 and V3 still declare hover transitions under reduced motion; neither runs a keyframe animation on the end card in that mode as far as the screenshots show. V2 and V4 strip everything.

## V1 Arcade
This looks like the machines at the seaside. The flashing cursor and the pixel letters are hard for me to read and the eyebrow text is tiny. My streak is mentioned on the card page but the whole thing is about beating other people, which isn't why I play. I would not type a name. Email: no. Best: nothing moves when I save. Worst: 8.5px pixel captions. Fixes: larger captions; stop the cursor blinking; a calmer skin for the word puzzle.

## V2 Sticker
Warm and friendly, and I like the idea of a book. The handwriting in the name box is a bit small for me and I'm not sure it's a real field. The "keep your sticker book if you switch phones" box is visible before I've decided anything, so it feels like a sign-up even though it says "no newsletter". I might sign a sticker. Email: not tonight. Best: the book page with my streak on it. Worst: the second step showing early. Fixes: hide step 2 until the sticker is signed; bigger handwriting; put the streak first on the book page.

## V3 Ledger
Big numbers, plain sentences, no flashing. "No email, no password, no newsletter, and the score is on the table either way" is exactly what I want to read. Nobody asks for anything on my second visit. My streak is on my own page, and that's where the email question lives, not on the puzzle. I'd add my name eventually. Email: yes, if it protects the streak. Best: the calm. Worst: the italic "Anonymous" ghost row is a little faint. Fixes: darken the ghost row; make the table tabs taller; keep the wording.

## V4 Weekly
Clear enough and the table doesn't shout. But "resets Sunday" and a countdown make me feel I'm being timed, and the email pitch appears on the very first finish. Name: maybe. Email: no, I don't want a Sunday email about a table. Best: "Name only. No account, no email, nothing to confirm." Worst: the ticking clock. Fixes: no countdown; email only on the account page; larger text in the table.

## Ranking
1. V3 — calm, legible, honest, asks nothing on the puzzle.
2. V2 — friendly but shows the sign-up box before I've decided.
2. V4 — tied; clear but competitive and asks for email too early.
4. V1 — not for me.

## If you combine
V3 as it is, with V2's streak-first account page.
