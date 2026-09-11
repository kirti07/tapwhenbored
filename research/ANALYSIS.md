# Analysis — four UX directions for leaderboards, name/email capture and registration

2026-09-05 · Tap When Bored · orchestrated on `main` @ 90bf561. Viewer: `research/ux-versions/index.html`. Nothing in `src/` was changed.

## Recommendation

**Build V3 Quiet Ledger as the base**, and take three parts from the others: V4's five-row "this week" window as a tab on the table page (with its Par row), V1's real Share string craft and pinned "where you actually are" strip, and V2's streak-first account page. V3 won with four of five personas, including the two whose tastes are furthest apart (the designer and the retired teacher), and it is the only version that measured clean on every stability check. The fifth persona's dissent changes one detail: ship the name field open, not folded (see Scores).

Why not the others as the base:
- **V4 Weekly** has the best return trigger and the clearest table, but its whole promise is stability and it measured a 24px end-card jump and eight sub-44px targets. Fixable, but the weekly reset also stresses two of five personas and advertises emptiness at today's traffic.
- **V1 Arcade** has the strongest personality and the most complete board, but the pixel type bottoms out at 8.5px, and the skin skews retro-gamer against the majority audience. Best as a per-game skin option later, not as the platform.
- **V2 Sticker** is the warmest but the longest card, two decisions visible at once, a fake Share, and a collection pitch that only pays off on return visits.

## Scores (5 personas × 7 criteria, max 35 each, max 175 total)

| Persona | V1 Arcade | V2 Sticker | V3 Ledger | V4 Weekly |
|---|---|---|---|---|
| Priya, desktop PM, 3-min gaps | 27 | 23 | **32** | 24 |
| Aisha, iPhone dark, designer | 26 | 26 | **27** | 24 |
| Marcus, Android on breaks | 25 | 28 | 22 | **30** |
| Sandra, iPad, streak, no motion | 18 | 24 | **32** | 24 |
| Dev, competitive, will spoof | 27 | 21 | **29** | 26 |
| **Total** | 123 | 122 | **142** | 128 |
| First-place votes | 0 | 0 | 4 | 1 |

Priya, Aisha and Marcus were full agent walkthroughs (screenshots + Playwright). Sandra and Dev were written by the orchestrator from one measurement script plus the screenshots after their agents were lost to network drops; their reports say so.

**The one dissent matters.** Marcus (gloves, breaks, cracked screen) put V3 last and V4 first: V3 folds the name field behind a "+" so saving is two taps, and its serif body text is small for his conditions. V4's visible pre-filled field with "Name only. No account, no email, nothing to confirm." was the best-liked ask copy across all five. So the recommended build ships V3's card with the name field **open by default** in V4's style, not folded.

## What was measured (390×844, touch, reduced motion)

| | V1 | V2 | V3 | V4 |
|---|---|---|---|---|
| End-card height, ask → saved | 844 → 844 | 805 → 801 (804 → 804 after polish) | 830 → 830 | **791 → 815** (752 → 752 after polish) |
| Sub-44px controls on end-first | 4 | 1 (0 after polish) | **0** | 8 (0 after polish) |
| Smallest text | **8.5px** | 10px | 11px | 10.5px |
| Keyframe/transition durations still declared under reduced motion | many | none | some (hover) | none |
| Share actually implemented | yes | **no** (yes after polish) | **no** | yes |
| All-time tab | yes | yes | yes | yes |
| "#N of M" rank for you | no | no | yes | no |
| Rules / honesty line | yes | yes | yes | yes |
| Name field: 40 chars / `<b>` / blank / emoji | cap 12 / raw / fallback / ok | cap 16 / raw / fallback / ok | n/a (collapsed) | cap 18 / raw / fallback / ok |
| Email or sign-in words on the returning end card | none | none | none | none |
| Input auto-focused on load (keyboard pop) | no | no | no | no |
| Horizontal scroll | none | none | none | none |

## Per-version verdict

**V3 Quiet Ledger** — result → one sentence of meaning → distribution bar → "#37 of 214 today · #612 all-time" → a folded "Add your name to the table" line with a ghost row that fills as you type. Email lives on the account page only. Praised: the ghost row, the wit lines, true near-black dark mode, zero small targets, constant 830px card. Gaps: Share does nothing (no string, no clipboard), table tabs are 38px, the demo pill overlaps `Play again` on 390, no weekly tab, card scrolls ~50px on 844. All are small.

**V1 Arcade Cabinet** — marquee shell, `NEW SCORE` reward state, board fills the card, 12-char monospace names, `/arcade` page with all eight cabinets and house rules. Praised: the ritual, working Share string, byte-identical heights across states, complete board. Gaps: 8.5px pixel captions, a 32px `Not now`, three 42px topbar icons, blink under reduced motion, "0 characters left" reads as an error, tone skews gamer.

**V4 Weekly Table** — one five-row window (top 3, you ±1, Par row, resets Sunday) reused on four screens. Praised: identical markup everywhere, calm league copy, "Name only. No account, no email, nothing to confirm.", Share string. Gaps: the 24px jump on save, eight small targets, countdown reads as pressure to two personas, email pitch on the very first finish.

**V2 Sticker Book** — signed sticker per game, wall of stickers, account page is the book. Praised: warmth, sticker with your time on it, no motion under reduced motion. Gaps: fake Share, two `Not now` buttons at once, step-2 email box visible before step 1 is decided, "SIGNED IN AS" chip reads like an account, longest card, handwriting font risk.

## Cross-version fixes (apply to whichever ships)
1. Reserve every dynamic block's height from first paint and assert it in a test: card height must be identical across first-time / saved / sent / loading / empty / error.
2. 44×44 hit areas on every control, including topbar icons, tabs, difficulty pills, back links and footer links. Visual size can stay.
3. Share must produce a real string via `navigator.share` with clipboard fallback and a `Link copied` confirmation that doesn't move layout.
4. Names: cap 12–16 chars, trim, collapse whitespace, fall back to the generated name, sanitise server-side, render as text only.
5. No text under 11px anywhere; no pixel or handwriting type for anything that must be read quickly.
6. Email only after the name is saved, or only on the account page; never bundled with the board.
7. Under `prefers-reduced-motion`, no keyframe animation runs on the end card; hover transitions may stay.

## What needs to exist server-side (any version)
Per-player rows (`player_id`, name, per-game best, per-period best), rank and count aggregates returned with the submit RPC, a percentile/distribution aggregate for V3, a weekly period for V4, magic-link auth (Supabase Auth email OTP), rate limiting and plausibility clamps per game, a `hidden` flag for moderation. This is a schema change, not a rendering change, and should come after the shell refactor in `REPORT.md` (A1, A9) so the end card is built once.

## Not done, and why
- The **`emil-design-eng` + `animate` polish pass** completed for **V2, V4 and V3** (V3: Playwright checks passed at 390 and 1280, 717px card in all states, name field now open by default; only the screenshot re-shoot was skipped at the user's request) (V2: real Share, one `Not now` at a time, 804px card in all states, all targets ≥44px. V4: the 24px jump fixed, 752px in all 8 states, all targets ≥44px, ticking countdown removed, calmer drama copy. Motion specs in their READMEs). The V1 agent was killed by connection drops (ECONNRESET / certificate errors) before writing a file, as were seven persona-tester attempts. Persona scores for V2 and V4 predate their polish; V4's two biggest dings (the jump, the small targets) are now fixed, which would lift it but not past V3 on the criteria the personas weighted. The exact per-version brief is in `research/03-polish-plan.md` and can be re-run in one message when the network is stable.
- Screens were reviewed from screenshots and scripted Playwright, not by a human on a device.

## Files
- `00-current-state.md` — what exists today (669 lines) · `01-research.md` — 18 reference products, patterns, seeds (813 lines) · `02-directions.md` — the spec all four followed · `03-polish-plan.md` — pending polish brief
- `ux-versions/index.html` — viewer (mobile/desktop, light/dark, per screen) · `ux-versions/v*/` — six pages, README, 24 screenshots each
- `personas/` — protocol and five reports · `shots/current/` — today's site for comparison · `tools/shoot.cjs` — screenshot script
