# game-ui-philosophy

## Purpose

This skill defines the visual and interaction philosophy for the entire arcade game collection.

The product should feel like a collection of small quick, satisfying arcade like browser games.

The primary goal is to make every game feel immediate:

> Open. Understand. Play.

There should be as little friction as possible between opening the game and interacting with it.

---

## Core Principles

### 1. Lightweight and fast is the highest priority

The entire web app must remain extremely lightweight and responsive.

Do not introduce heavy dependencies, large animation libraries, unnecessary JavaScript, large image assets, complex rendering systems, or expensive visual effects unless there is a clear gameplay benefit.

Prefer:

* Vanilla HTML, CSS and JavaScript
* CSS transitions and animations over JavaScript animation loops where possible
* Simple DOM structures
* Reusable components and styles
* Small, efficient assets
* Native browser capabilities
* Simple visual treatments that perform well

Avoid:

* Unnecessary libraries
* Heavy particle systems
* Large background videos or images
* Constant animation loops without gameplay value
* Complex effects that cause lag
* Excessive blur, filters, shadows or layered effects
* Decorative elements that increase rendering cost without improving the game

The product should feel fast on first load and immediately responsive during play.

When choosing between a visually impressive solution and a simpler, faster solution, prefer the simpler solution unless the visual difference significantly improves gameplay.

---

## 2. The games are the interface

The game board or main interaction should always be the visual focus.

Everything else should support gameplay.

The hierarchy should generally be:

1. Game interaction
2. Immediate game state or feedback
3. Essential controls
4. Secondary actions

Do not allow headers, cards, navigation, explanatory text, statistics, badges or decorative UI to compete with the game itself.


If an element is not helping the player understand, play, or recover from the game, question whether it needs to exist.

Every game should have a Share button
---

## 3. Remove before adding

When improving a screen, first ask:

> What can be removed?

Do not solve every UX problem by adding another label, button, container, card, icon, or decorative treatment.

Prefer:

* Fewer controls
* Clearer spacing
* Better grouping
* Better feedback
* Stronger hierarchy
* More obvious interaction states

over adding more UI.

Minimal does not mean empty. The screen should feel intentionally designed, not unfinished.

---

## 4. Interactions should feel immediate

Every game should provide clear feedback for:

* Tap
* Click
* Selection
* Valid action
* Invalid action
* Progress
* Success
* Failure
* Completion

Feedback should be quick and easy to understand.

Avoid delayed, ambiguous, or misleading feedback.

The UI must never temporarily suggest that the wrong game element was selected or changed. Game-state feedback should always reflect the actual underlying game state.

Where practical, update the visual state from a single source of truth so interaction feedback cannot drift from the actual game logic.

**The DOM is a rendering target, never the state.** Do not rebuild a word from
tile `textContent`, do not parse a counter back out of the element that
displays it, and do not keep a piece's identity in a `data-` attribute that
game logic then reads back. The moment display and logic share a variable, a
copy change becomes a gameplay bug — and it will be a gameplay bug nobody
thinks to look for, because the commit that caused it only touched text.

---

## 5. Touch behaviour is part of the game design

The games must work cleanly on touch devices.

Prevent browser behaviour that interferes with gameplay, including accidental double-tap zooming, unwanted text selection, dragging, and touch gestures that conflict with game interactions.

Do not disable useful browser behaviour globally unless necessary.

Apply interaction restrictions only to the relevant game surface.

Touch targets should be large enough to use comfortably without making the interface visually bulky.

Use appropriate CSS and event handling so rapid taps and repeated interactions remain reliable.

---

## 6. Dark mode: Neon Arcade

Dark mode should feel like a modern, refined arcade.

Characteristics:

* Dark backgrounds
* Strong contrast
* Selective neon colour
* Bright interaction states
* Crisp shapes
* Focused glow
* Minimal visual clutter

Neon should highlight interaction, not decorate every surface.

Use glow selectively for:

* Active elements
* Selected elements
* Important game states
* Success moments
* Critical feedback

Avoid making every border, card, button and text element glow.

The result should feel energetic and playful without becoming visually noisy or overly cyberpunk.

---

## 7. Light mode: Soft Pop

Light mode should feel playful, clean and tactile.

Characteristics:

* Soft backgrounds
* Warm or gentle colour combinations
* Rounded but not childish shapes
* Clear contrast
* Simple depth
* Friendly interaction feedback

Use colour to establish hierarchy and game states.

Avoid excessive gradients, shadows, decorative illustrations or card-heavy layouts.

Soft Pop should feel like a different atmosphere, not merely Neon Arcade with a white background.

---

## 8. Themes should not change the structure

Dark and light modes should share the same interaction model and core layout wherever possible.

The theme should primarily change:

* Colour
* Contrast
* Shadows
* Glow
* Surface treatment
* Mood

Do not create separate UI systems for each theme unless the gameplay genuinely requires it.

Use shared design tokens or CSS variables so theme changes remain lightweight and maintainable.

---

## 9. Motion should communicate

Animation should help the player understand:

* What changed
* What moved
* What was selected
* Whether an action was accepted
* Whether the player succeeded or failed

Avoid animation that exists only to make the page feel more active.

Keep most motion short and responsive.

### Reduced motion means gentler, not zero

`prefers-reduced-motion: reduce` is a request to stop things moving, not a
request for a broken page. The blanket `transition-duration: 0.001ms` kill that
gets pasted around is not the answer, and neither is deleting the rule.

* Restrict transitions to `opacity`, colour, `box-shadow` and `filter`, around
  120ms.
* **Author every animated element so its base CSS is the final state.** Turning
  the animation off must leave the page correct — not blank, and not with an
  element stuck at the animation's first frame. An animation that ends at
  `opacity: 0` and is simply switched off leaves that element on screen
  forever.
* Nothing animates forever. An infinite animation is the first thing to go.
* When a moving thing was carrying meaning — which tile is a valid target,
  which piece to try next — replace it with a static equivalent. Removing it
  takes the game's teaching with it.
* Beware specificity. A reduced-motion override on `.icon polygon` loses to
  `.icon polygon:first-child`, so the rule reads correctly and never applies.
  Match the specificity of what you are overriding, and test with the
  preference emulated rather than trusting the stylesheet.

### The motion budget

* End-card entrance: opacity plus 8px of travel, 200-240ms, ease-out,
  interruptible. **No exit animation** — leaving is navigation.
* Button press: `transform: scale(.98)`, 80ms.
* Tab or panel change: 120ms cross-fade, no slide.
* At most one celebration, only for a genuine record, under 600ms, CSS-only,
  transform and opacity only, and fully off under reduced motion.

---

## 10. Every game should feel self-explanatory

A player should understand the basic interaction within a few seconds.

Avoid large instruction blocks.

Prefer teaching through:

* Layout
* Affordances
* Short prompts
* Immediate interaction
* Feedback

Instructions should explain only what cannot be understood from the game itself.

---

## 11. A game nobody can operate is not finished

Accessibility is a gameplay property, not a compliance pass at the end.

Every game must be playable with a keyboard alone. If the board can only be
driven by pointer, the game is unfinished — not "unfinished for some players",
unfinished.

Roles describe what a thing **is**:

* Never put `role="img"` on an interactive board. It tells a screen reader the
  board is a picture, and there is then no way to play.
* Never put `role="status"` on a button. It replaces the control's own role, so
  the player is told there is a message where there is actually something to
  press.
* A `role="switch"` must set `aria-checked`, and keep it in step.

There must be exactly one visible focus style, and it must be visible on every
control. A focus ring may only draw **around** an element — never change its
box, radius or size. A ring that reshapes the button it lands on is worse than
no ring.

A message that appears without moving the pointer (a share confirmation, a
hint, an error) needs `aria-live`. A visual-only change says nothing.

> Unplug the mouse. Play the game to the end, restart it, open and close the
> rules. If you cannot, it is not done.

---

## 12. An overlay is a dialog

An end card that the player can click through is not an end card.

When an overlay is up:

* Focus moves into it.
* Focus cannot leave it by Tab.
* Everything behind it leaves the tab order, the hit test **and** the
  accessibility tree. Dimming with `opacity` and `pointer-events` does none of
  those three — the board stays fully reachable by keyboard and screen reader.
* Escape dismisses it.
* Focus returns to where it came from when it closes.

Two rules about **where** focus lands, both learned the hard way:

* It lands on the **replay** control, so finishing and pressing Enter starts
  another game. That is the single most-valued interaction in the whole
  product.
* It never lands on a text field. An absent-minded Enter must not commit
  anything.

And the rule that constrains all of the above:

> A modal is for reading, not for asking. Never build an end card that must be
> dismissed before the player can play again.

---

## 13. If it makes a sound, it has a mute

Six of eight games shipped with sound and no way to stop it. That is not a
missing feature, it is a game that cannot be played in a waiting room.

* Any game that makes a noise has a mute, in reach, on the main screen.
* The preference is site-wide. Muting in one game mutes the shelf.
* Audio must survive a tab switch. A context created outside a gesture starts
  suspended and a backgrounded one is suspended again; resume on the next
  interaction and when the page becomes visible, or the game goes silent for
  the rest of the session and never comes back.

---

## 14. The device has a notch, and the player has thumbs

Layout facts, not polish:

* `viewport-fit=cover` plus safe-area padding is part of the layout. Using
  `env(safe-area-inset-*)` without `viewport-fit=cover` resolves to zero — the
  padding looks present in the stylesheet and does nothing on the device.
  Enabling `cover` without padding the top bar moves the problem rather than
  fixing it; both belong in the same change.
* **44x44 is the floor for anything tappable.** Expand the hit area rather than
  the ink: a centred pseudo-element gives 44x44 of target around however much
  design the control calls for, and changes no layout.
* Where a grid pitch makes 44 wide impossible — a keyboard, a swatch row —
  keep the width and take the height. Never let enlarged targets overlap; two
  controls stealing each other's taps is worse than one small control.
* Hover is not a touch state. Every `:hover` rule belongs behind
  `@media (hover: hover) and (pointer: fine)`, or a tap leaves a control
  looking selected until the player taps elsewhere.
* Controls get `touch-action: manipulation` and their own `:active` state.
* Nothing a player is expected to read is under 11px.
* Landscape is a real orientation. A phone on its side has a third of the
  height the layout was drawn for.

---

## 15. Nothing moves that the player did not move

Reserve space before you fill it.

An element that is hidden until the network answers, and then appears, pushes
everything below it down — at exactly the moment the player is reaching for the
button that moved. Give async content its height up front.

The strictest form of this rule, and the one worth remembering:

> Nothing may push the replay button down the screen.

Buttons do not resize, restyle or move when their state changes. A control that
changes its own label is worse still: for as long as the confirmation shows,
the control has no name.

---

## 16. One vocabulary

The same action has the same name in every game.

* Replay is `Play again`. Not "Again", not "Play Again", not "New prompt".
* Share is `Share`. Its confirmation is `Link copied`.
* One glyph means one thing.

If a game's visual register needs shouting, `text-transform` does that. The
string in the markup is what a screen reader reads and what a player recognises
from the last game they played, so the string stays the same.

A confirmation must be true. A Share button that reports "Link copied" without
copying anything is worse than no Share button, because it lies.


---

## Final Decision Rule

Before adding any UI, animation, effect or dependency, ask:

1. Does it improve gameplay or orientation?
2. Does it make the interaction clearer?
3. Does it preserve fast loading and responsiveness?
4. Can the same result be achieved more simply?

If the answer is no, do not add it.

The desired result is:

> Small games that feel polished, immediate, satisfying and fast.

Not feature-rich interfaces.

Not decorative websites.

Not dashboards.

The game is the product.

## Responsive and Cross-Device Design

The entire game collection must provide a good experience across:

* Mobile phones
* Tablets
* Laptops
* Desktop browsers

Do not create separate interfaces for different devices unless absolutely necessary.

Prefer one lightweight responsive system that adapts naturally based on available screen space.

The game should remain easy to understand and play at every screen size.

### Mobile

Prioritize:

* Comfortable touch targets
* Clear game interactions
* Minimal unnecessary UI
* No accidental browser zoom or gesture conflicts
* Appropriate use of available screen space
* No important controls requiring excessive scrolling

Do not simply shrink the desktop interface.

### Tablet

Use the additional space to improve breathing room and game presentation without unnecessarily adding more UI.

The game should remain the primary focus.

### Laptop and Desktop

Use additional screen space deliberately.

Do not stretch game boards, controls or content indefinitely just because more space is available.

Maintain comfortable maximum widths and preserve the intended proportions of each game.

### Responsive Behaviour

Layouts should adapt based on available space rather than targeting specific devices by name.

Prefer:

* Flexible layouts
* CSS Grid or Flexbox where appropriate
* Relative sizing
* `min()`, `max()`, and `clamp()` where useful
* A small number of meaningful breakpoints
* CSS-based responsive behaviour

Avoid:

* Large numbers of device-specific breakpoints
* JavaScript-based layout detection unless necessary
* Separate mobile and desktop implementations
* Hardcoded viewport assumptions
* Heavy responsive frameworks

### Game Board Adaptability

Each game board should preserve its gameplay clarity and intended proportions across screen sizes.

If available space becomes limited:

1. Preserve the game interaction
2. Preserve touch usability
3. Reduce or reposition secondary UI
4. Simplify surrounding layout if necessary

Do not allow decorative UI to consume space needed by the game.

### Orientation

Where practical, support both portrait and landscape orientations.

Do not lock orientation unless the gameplay genuinely requires it.

The interface should remain usable when browser dimensions change dynamically.

### Final Rule

A responsive change is successful when the same game feels natural to play on a phone, tablet, laptop and desktop without requiring separate versions of the interface.

Responsive design must not significantly increase bundle size, rendering work or implementation complexity.

## Colour Harmony and Visual Cohesion

Do not evaluate colours individually. Evaluate how colours interact with the rest of the screen.

A colour may look good on its own but still feel visually disconnected from the overall theme.

When styling a game, consider the relationship between:

* The page background
* The surrounding UI
* The game board or main object
* Interactive elements
* Accent colours
* Shadows and depth
* Selected, success and failure states

Ask:

> Does this colour belong in the same visual world as the rest of the interface?

Do not preserve an existing colour simply because it belongs to the original game design.

If a game object visually clashes with the active theme, refine its colour, tone, saturation, warmth, shadow or surrounding surface treatment.

The goal is not for every game to use the same colours.

The goal is for different colours to feel intentionally related.

### Example

A purple or lavender Soft Pop environment may clash with a highly realistic orange or yellow wooden game board.

Do not automatically keep both unchanged.

Consider whether the board should be refined by adjusting its:

* Hue
* Warmth
* Saturation
* Brightness
* Texture intensity
* Shadow
* Border treatment

Alternatively, adjust the surrounding theme surfaces so the relationship feels intentional.

Preserve the identity of the game, but adapt its visual treatment to the active theme.

### Theme Harmony

Every game should have its own personality while still belonging to the active theme.

A game may use colours outside the main theme palette, but those colours should feel deliberately compatible rather than accidental.

For example:

* Warm colours can work within a cool theme if their saturation and intensity are controlled.
* A natural material can work within a playful theme if its treatment is simplified and visually integrated.
* A contrasting accent should create intentional focus rather than visual conflict.

Do not rely on arbitrary colour combinations.

Use visual judgment.

### Final Colour Test

Before approving a visual change, inspect the full screen rather than individual components.

Ask:

1. Which colour is visually dominant?
2. Which colour is secondary?
3. Where does the eye go first?
4. Do the game colours support or fight the surrounding theme?
5. Does anything look pasted in from a different visual system?
6. If the page background changed, would the game object still feel integrated?

If a game looks like it belongs to a different product, refine the colour relationship before adding more visual effects.
