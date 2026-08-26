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

Respect reduced-motion preferences where practical.

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
