# 03 — Polish plan (pending): `emil-design-eng` + `animate` pass on the four demos

Status 2026-09-05: **V2, V4, V3 done** (V3 screenshots not re-shot) (see each README → Polish pass). V1 still pending: their agents were killed by network drops before writing. Re-run when the connection is stable: one agent per version, each must call the `Skill` tool with `emil-design-eng` then `animate` before editing, work only inside its own `research/ux-versions/<v>/`, re-shoot with `node research/tools/shoot.cjs research/ux-versions/<v>`, and assert with Playwright at 390×844: no control under 44×44, `scrollWidth === 390`, end-card height identical across all states, Escape closes, focus lands on `Play again`, Share writes to the clipboard. Each README gets a "Polish pass" section with the motion spec (purpose, property, easing, duration, reduced-motion behaviour per animation).

## Motion budget (all versions, from the animate skill's decision order)
- End card entrance: opacity + 8px translateY, ease-out, 200–240ms, interruptible, no exit animation on `Play again` (navigation).
- Name saved: swap in place, opacity 120ms; no height change.
- One celebratory motion only on personal best / top 3: ≤600ms, CSS-only, transform/opacity only, fully disabled under reduced motion.
- Tab switch: opacity cross-fade 120ms, no slide.
- Button press: `transform: scale(.98)` on `:active`, 80ms, no hover-only affordances on touch.
- Under `prefers-reduced-motion: reduce`: no keyframe animation anywhere; transitions ≤ 0.01ms.

## V1 Arcade
`Not now` to 44px; three topbar icons 42→44 hit area; "See all 8 cabinets" as a 44px row; pixel captions ≥11px or removed; "0 characters left" hidden until typing; cursor blink ≤1Hz and off under reduced motion; reduce competing accents; confirm Share + `Link copied` without layout shift.

## V2 Sticker — DONE
Implement Share (string in the sticker voice, `navigator.share` → clipboard); initial focus on `Play again`; quiet identity chip instead of "SIGNED IN AS"; step 2 collapsed to a same-height preview until step 1 completes so only one `Not now` is visible; tabs 38→44px; hold card height exactly (805→801 today); Caveat only for the signature, ≥20px, check dark contrast; trim vertical rhythm.

## V3 Ledger — DONE
Implement Share (string in the ledger voice); move the demo pill off `Play again` on 390; fit the card in 844 without scrolling; tabs 38→44px; slightly stronger affordance on the folded name line; darken the ghost row; add a "This week" tab and "of M players" on the table header; keep everything praised.

## V4 Weekly — DONE
Reserve the email step's height from first paint (791→815 today; assert identical); 44px on back link, topbar icons, difficulty pills, "Full table"; give the card ≥24px headroom on 844; replace the ticking countdown with a static "resets Sunday" (time on tap); soften the drama line; move the email pitch to after the name is saved or to the account page; "#N of M" on your row.
