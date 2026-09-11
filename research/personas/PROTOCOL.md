# Persona walkthrough protocol

Five testers, one persona each. Every tester walks all four versions through the same six screens
and files ONE report: `research/personas/<persona>.md`. Reports must be comparable, so follow the
scoring rubric literally and keep opinions tied to a screenshot or a specific element.

## Materials
- Spec: `research/02-directions.md` (what each version is trying to be; §1.2 flow rules, §1.3 stability rules).
- Persona detail: `research/01-research.md` §7 "Five personas".
- Versions: `research/ux-versions/v1-arcade`, `v2-sticker`, `v3-ledger`, `v4-weekly`. Each has six HTML files and `shots/*.png` (mobile+desktop × light+dark, full page).
- Viewer: `research/ux-versions/index.html`.

## Walkthrough (per version, in this order)
1. `home.html` — could I tell what the site is and start a game in one tap? Do I understand what the board/identity thing is without reading?
2. `play.html` — does the shell get out of the way? Any distraction from the board? Would I know where "my rank" lives?
3. `end-first.html` — finish for the first time. Read the result, the ask, the email pitch. Would I type a name? Would I give an email? Was anything blocking or confusing? Click through the demo states (the `.demo-bar` pill) and check the success state.
4. `end-returning.html` — visit two. Is there any nag? Can I play again in one tap?
5. `leaderboard.html` — find myself, switch games, switch tabs, look at loading/empty/error states.
6. `account.html` — would I register? Is the magic-link flow clear? Can I delete my data?

Do this on the persona's primary device (mobile testers use the 390 screenshots and open the file in a
390-wide Playwright context if needed; desktop testers use the 1280 ones), in the persona's theme.
Also glance at the other device/theme for anything broken.

Use Playwright (`require('playwright')`, node script in the scratchpad) to actually interact when a
judgement needs it: tab through the end card, press Escape, type a name, submit an invalid email,
check `document.documentElement.scrollWidth` at 390, count tap targets under 44px
(`getBoundingClientRect` on buttons/links/inputs), and check whether the end card's height changes
between the ask state and the saved state (measure `getBoundingClientRect().height` before/after).

## Scoring rubric (0–5 each, per version)
| Criterion | 5 means |
|---|---|
| Clarity | I always knew what I was looking at and what to do next. |
| Friction | Nothing blocked play; asks were skippable in one tap; no surprise keyboard. |
| Trust | I believed the site would treat my name/email well; consent was clear and unbundled. |
| Playfulness | It made me smile without getting in the way. |
| Stability | No layout jump, no clipped text, no motion I didn't want, works in my theme/device. |
| Would-return | This would make me come back, or at least not stop me. |
| Persona-fit | It respects what *this* persona cares about (see their "annoyed by"). |

Also record per version: **Would submit a name? (Y/N + why)**, **Would give email? (Y/N + why)**,
**Would register? (Y/N + why)**, **the single best moment**, **the single worst moment**,
**three concrete bugs or fixes** (element + screen + what to change).

## Report format (`research/personas/<persona>.md`)
1. Persona in 3 lines (name, device/theme, what they care about / hate).
2. Scores table: 4 versions × 7 criteria + total.
3. Per version: 6–10 lines of narrative in the persona's voice, then the Y/N answers, best/worst moment, three fixes.
4. Ranking with one sentence of justification each.
5. "If you combine": the two or three elements from other versions the persona would steal for their #1.
Be specific and honest. Low scores are useful. Cite screenshot filenames when pointing at something.
