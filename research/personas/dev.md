# Dev — 19, CS student. Laptop + phone, dark theme, Reddit-referred, 40-minute sessions to top a board. Will try to break it.
Cares about: real numeric ranks, all-time and weekly, stated scoring/tie/reset rules. Hates spoofable boards, percentiles instead of ranks, empty boards.
Method: `measure.cjs` (page text for "All-time", "#N" ranks, "verified/for fun", rule words; name-field abuse: 40 chars, `<b>hi</b>`, whitespace, emoji) plus the dark captures. Report written by the orchestrator after the persona agent was lost to network drops.

## Scores
| Criterion | V1 Arcade | V2 Sticker | V3 Ledger | V4 Weekly |
|---|---|---|---|---|
| Clarity | 4 | 3 | 5 | 4 |
| Friction | 4 | 3 | 4 | 4 |
| Trust | 3 | 3 | 4 | 4 |
| Playfulness | 4 | 3 | 3 | 3 |
| Stability | 4 | 4 | 5 | 3 |
| Would-return | 4 | 3 | 4 | 4 |
| Persona-fit | 4 | 2 | 4 | 4 |
| **Total** | **27** | **21** | **29** | **26** |

## Measurements
| | V1 | V2 | V3 | V4 |
|---|---|---|---|---|
| All-time tab on leaderboard | yes | yes | yes | yes |
| Numeric "#N" rank for you on the board page | no (position strip, no #) | no | yes | no (rank column, no #) |
| Rules text (ties / reset / how scoring works) | yes (house rules) | yes | yes | yes, on every page |
| "Not verified / for fun" line | yes | yes | yes | yes |
| Name: 40 × "x" | cut to 12 | cut to 16 | field collapsed, not reachable by script | cut to 18 |
| Name: `<b>hi</b>` | stored raw | stored raw | — | stored raw |
| Name: whitespace only | falls back to generated name | falls back | — | falls back |
| Name: 🔥🔥🔥 | accepted | accepted | — | accepted |

All three testable versions store `<b>hi</b>` verbatim. That's fine only if every render path uses `textContent`; the production rule must be: sanitise server-side, render as text, never `innerHTML`.

## V1 Arcade
Eight cabinets, Today / This week / All-time, house rules written down, and my row pinned even when I'm 40th. The 12-char cap is a real limit, not a suggestion. Rank is shown as a position strip rather than a "#", which I'd want. Board fills the end card, so I see who I have to beat before I replay. Name: yes. Email: yes, "ping me when I get knocked off" is exactly the notification I'd want. Best: the all-cabinets page. Worst: no explicit numeric rank on the board. Fixes: "#N of M" on the pinned row; state the tie rule next to the table; HTML-escape on render.

## V2 Sticker
It's a wall, not a table. Ranked view exists one tap deeper but the primary surface is "best and newest", which hides how many people are actually on it. No "#" anywhere. Name: sure. Email: no reason. Best: the all-time tab exists. Worst: the wall makes the board feel decorative. Fixes: lead with the ranked table on the leaderboard page; show "#N of M"; show counts.

## V3 Ledger
"#37 of 214 today · #612 all-time" is the line I want, and the table page has the honesty line and the rules. Percentile is there too, but it's secondary to the rank, which is the right order. The name ask is folded away so I can't stress-test it from a script, which is fine. Name: yes. Email: yes, for the account page with bests on all eight. Best: rank + all-time in one line. Worst: I'd want a weekly tab too. Fixes: add This week; show M (players) on the table header; escape on render.

## V4 Weekly
Weekly + all-time on every page, rules on every page, and a Par row so the board is never empty. "2 moves off 3rd" is the right kind of pressure. Ranks are a column but not "#N of M". Card jumps when I save. Name: yes. Email: yes, Sunday top-3 mail. Best: rules everywhere. Worst: the 24px jump. Fixes: reserve the height; "#N of M"; 12-char cap like V1.

## Ranking
1. V3 — rank, percentile and all-time in one honest line; the calmest table.
2. V1 — most complete board (8 cabinets, 3 tabs, rules, pinned row).
3. V4 — weekly + all-time everywhere, loses on the jump.
4. V2 — a wall isn't a leaderboard.

## If you combine
V3's result line and table, V1's pinned "where you actually are" strip, V4's Par row.
