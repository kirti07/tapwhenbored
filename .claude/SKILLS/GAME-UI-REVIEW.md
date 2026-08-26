# game-ui-review

## Purpose

Before making visual changes, review the current game UI as both:

* A game designer
* An interaction designer

Do not immediately begin adding new styling or components.

First identify what is unnecessary, distracting, misleading, slow, or making the product feel like a generic website rather than a lightweight arcade game.

---

## Review the Current UI First

Inspect the existing screen and ask:

### Does it feel like a game?

Identify anything that makes the experience feel like:

* A blog
* A landing page
* A SaaS product
* A dashboard
* A generic website
* A settings panel
* A collection of cards
* An app with too much chrome around the main interaction

Remove or simplify those elements before adding visual styling.

The game should be the dominant object on the screen.

---

## Look for UI that can be removed

Before adding anything, identify:

* Redundant labels
* Repeated instructions
* Unnecessary containers
* Decorative cards
* Excessive borders
* Too many buttons
* Duplicate status indicators
* Unnecessary icons
* Large headers
* Secondary information competing with gameplay

Prefer simplification over addition.

If a player can understand something through layout or interaction feedback, do not add explanatory UI for it.

---

## Review hierarchy

Check whether the player's eye is naturally drawn to the correct place.

The hierarchy should make it obvious:

1. What the player is looking at
2. What they should interact with
3. What just happened
4. What they can do next

If the player needs to search for the game interaction, the hierarchy is wrong.

---

## Review interaction feedback

Check every important interaction for accuracy and timing.

Verify that:

* The correct item is highlighted
* Selection states update immediately
* Incorrect actions do not briefly appear correct
* Correct actions are clearly acknowledged
* Rapid taps do not produce inconsistent states
* Visual state always matches actual game state
* Animations do not delay or obscure important state changes

Pay special attention to race conditions, stale state, delayed DOM updates and interactions occurring during transitions.

Never allow temporary visual feedback that contradicts the actual game logic.

---

## Review touch and browser behaviour

Check the game on touch-oriented interactions.

Look for:

* Double-tap zoom
* Accidental text selection
* Unwanted dragging
* Touch delays
* Missed taps
* Small touch targets
* Scroll conflicts
* Gesture conflicts

Fix these issues with the smallest possible implementation.

Do not introduce heavy gesture libraries for simple interaction problems.

---

## Review performance

Before approving any visual change, consider its cost.

Identify:

* Large DOM structures
* Repeated layout calculations
* Expensive animations
* Constant JavaScript loops
* Excessive filters or blur
* Large assets
* Unnecessary dependencies
* Effects applied to many elements simultaneously

If a visual treatment is expensive and provides little gameplay value, remove or simplify it.

The app must remain extremely lightweight and fast.

---

## Review theme consistency

Check whether the UI clearly belongs to one of the two design systems:

### Dark mode: Neon Arcade

Should feel:

* Focused
* Energetic
* Crisp
* High contrast
* Playful

Neon should emphasize interaction and important states.

### Light mode: Soft Pop

Should feel:

* Clean
* Playful
* Soft
* Tactile
* Clear

Colour and depth should support interaction without turning the UI into a card-heavy application.

---

## Required Review Output

Before making changes, provide a concise internal assessment with:

1. What should be removed
2. What should be simplified
3. What interaction bugs or misleading states exist
4. What is harming hierarchy
5. What could hurt performance
6. What should change for Neon Arcade
7. What should change for Soft Pop

Then make only the changes that materially improve the result.

Do not add new elements simply because the screen feels visually plain.

Plain is acceptable.

Confusing, slow or cluttered is not.



## Review Responsive Behaviour

Before making UI changes, review the game across a range of screen sizes.

Check representative layouts for:

* Small mobile screens
* Large mobile screens
* Tablets
* Laptop screens
* Large desktop browsers

Do not review responsiveness only by checking whether the page technically fits on the screen.

Review whether the game remains genuinely comfortable and intuitive to play.

### Check for

* Horizontal overflow
* Clipped game elements
* Excessive empty space
* Overly stretched game boards
* Controls becoming too small
* Touch targets becoming difficult to use
* Text becoming unnecessarily large or small
* Important controls moving too far from the game
* Excessive scrolling during gameplay
* Broken alignment
* Layout shifts during interaction
* Theme inconsistencies across responsive layouts

### Test Dynamic Resizing

Check what happens when the browser changes size.

The layout should adapt cleanly without:

* Broken positioning
* Incorrect game dimensions
* Stale calculations
* Misaligned interaction areas
* Incorrect touch or click targets

### Responsive Simplification

On smaller screens, do not attempt to preserve every desktop UI element.

Prioritize the game.

If space is limited, simplify or reposition secondary information before shrinking the game interaction to an uncomfortable size.

### Performance

Do not solve responsive problems by introducing unnecessary JavaScript, duplicate DOM structures or device-specific implementations.

Prefer lightweight CSS solutions whenever possible.
