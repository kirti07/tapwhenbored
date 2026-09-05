# game-ui-refinement

## Purpose

Use this as the final refinement pass after the UI direction has been decided.

Preserve existing functionality unless a change is required to fix a bug, interaction problem or clear UX issue.

The goal is not to redesign everything.

The goal is to make the existing game feel more intentional, clear, responsive and polished.

---

## Refinement Priorities

### 1. Preserve functionality

Do not break working game logic while changing the interface.

After refinement, verify that:

* Gameplay still works
* Win and loss conditions still work
* Restart behaviour works
* Theme switching works
* Touch and mouse interactions work
* Rapid interactions remain stable

If visual changes expose existing bugs, fix the underlying issue rather than masking it with CSS.

---

## 2. Make the hierarchy clearer

Strengthen the visual priority of:

1. The game
2. The current game state
3. The immediate action
4. Secondary controls

Reduce the prominence of everything else.

Do not add more UI to create hierarchy when spacing, contrast, sizing or positioning can solve the problem.

---

## 3. Reduce visual noise

Remove or reduce:

* Unnecessary borders
* Excessive shadows
* Excessive glow
* Decorative backgrounds
* Repeated colours
* Too many competing emphasis styles
* Unnecessary text
* Unnecessary icons
* Over-animation

Use emphasis deliberately.

If everything is visually important, nothing is important.

---

## 4. Improve spacing and alignment

Refine:

* Consistent spacing
* Alignment between related elements
* Separation between unrelated elements
* Breathing room around the game area
* Comfortable touch targets

Do not add empty space merely for aesthetic reasons.

Spacing should make the interface easier to scan and use.

---

## 5. Improve game-state feedback

Make every important state obvious and accurate.

Refine feedback for:

* Idle
* Hover, where relevant
* Pressed
* Selected
* Valid
* Invalid
* Success
* Failure
* Completion

Feedback should be immediate and should never temporarily indicate the wrong state.

Use one clear visual language for each state across the game.

---

## 6. Refine motion

Keep animations short, purposeful and responsive.

Motion should clarify change.

Remove motion that:

* Delays interaction
* Makes the game feel slower
* Competes with gameplay
* Runs continuously without purpose
* Creates unnecessary rendering work

Prefer CSS transitions and transforms where appropriate.

Avoid introducing animation libraries unless absolutely necessary.

### The motion budget

Refine towards these numbers rather than inventing new ones per game:

| Moment | Treatment |
| --- | --- |
| End-card entrance | opacity + 8px translateY, 200-240ms ease-out, interruptible |
| End-card exit | none — leaving is navigation, not an animation |
| Button press | `transform: scale(.98)`, 80ms, on `:active` |
| Tab or panel change | 120ms cross-fade, no slide |
| A value updating in place | opacity, 120ms, and no height change |
| Celebration | only on a genuine record, under 600ms, CSS-only, transform and opacity only |

Nothing runs forever. An idle screen should be still.

### Reduced motion: gentler, not zero

Under `prefers-reduced-motion: reduce`, the goal is a calm page, not a broken
one.

* Transitions restricted to `opacity`, colour, `box-shadow` and `filter`, about
  120ms.
* **Base CSS is the final state.** Switching an animation off must leave the
  element where it belongs. An animation ending at `opacity: 0` that is simply
  disabled leaves its element on screen permanently — check every `forwards`
  animation for this.
* When motion was carrying meaning, replace it with a static equivalent rather
  than deleting it. A pulse that showed valid targets becomes a held highlight.
* Watch specificity: overriding `.thing:first-child` with `.thing` does
  nothing, and the stylesheet will look correct while doing nothing.
* Verify with the preference emulated, never by reading the CSS.

---

## 6b. Refine focus and keyboard order

Part of the refinement pass, not a separate concern.

* Tab through the screen after every change. Is the order still the reading
  order?
* Does every control show where focus is? Does the ring draw around the control
  without changing its shape?
* When an overlay opens, does focus move into it, land on the replay control,
  and return to its origin on close?
* Did a visual change quietly remove a control from the tab order, or add a
  collapsed one to it? An element hidden with `max-height: 0` and `opacity: 0`
  is still focusable — use `visibility` so it leaves the tab order too.

---

## 7. Refine both themes

Apply the same UX improvements to both modes.

### Neon Arcade

Refine toward:

* Strong focus
* Crisp contrast
* Selective neon
* Controlled glow
* Immediate feedback

Do not let glow become background decoration.

### Soft Pop

Refine toward:

* Clean surfaces
* Friendly colour
* Gentle depth
* Clear interactions
* Playful restraint

Do not make it childish or overly rounded.

---

## 8. Protect performance

Every refinement must preserve the app's lightweight nature.

Do not introduce:

* New heavy dependencies
* Large assets
* Complex rendering systems
* Constant animation loops
* Expensive visual effects at scale

Prefer the smallest implementation that produces the desired UX improvement.

Performance is part of the design quality.

---

## Final Refinement Rule

For every change, ask:

> Does this make the game easier to understand, nicer to interact with, or more satisfying to play?

If not, do not add it.

The final result should feel:

* Faster
* Cleaner
* More focused
* More responsive
* More polished

without becoming more complex.

The refinement pass should usually result in fewer distractions, not more UI.

## Refine Across Screen Sizes

As part of the final refinement pass, check the UI across mobile, tablet, laptop and desktop browser sizes.

Do not optimize only for the screen currently being viewed.

### Refine

* Game board sizing
* Maximum widths
* Spacing
* Alignment
* Touch targets
* Text scale
* Control placement
* Use of available space

### Small Screens

Prioritize:

1. Gameplay
2. Interaction accuracy
3. Comfortable touch targets
4. Essential game feedback
5. Secondary controls

Remove, simplify or reposition secondary UI before compromising the main game interaction.

### Large Screens

Do not allow additional space to make the UI feel sparse, stretched or like a dashboard.

Maintain intentional proportions.

The game should remain visually focused rather than expanding indefinitely with the viewport.

### Theme Consistency

Verify that both:

* Soft Pop
* Neon Arcade

adapt correctly across all screen sizes.

The themes may change mood and visual treatment, but responsive behaviour and interaction quality should remain consistent.

### Final Responsive Check

Before considering refinement complete, verify that the game:

* Fits comfortably across common screen sizes
* Does not have unintended overflow
* Maintains usable interaction targets — measured, and never under 44x44
* Preserves gameplay proportions
* Handles browser resizing correctly
* Works with both touch and mouse input
* Works in landscape on a phone, which is a third of the height the layout was
  drawn for
* Remains lightweight and responsive

Measure hit areas rather than judging them. A control can look generous and be
13 pixels tall, and the back link — the only way out of a game — is the one
most likely to be both.

Do not create separate mobile, tablet and desktop applications.

Use one efficient responsive system wherever possible.
