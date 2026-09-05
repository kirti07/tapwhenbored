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

## Review accessibility

A review that only looks at the screen cannot find the defects that actually
shipped. Put the mouse down.

### Keyboard

* Tab through the whole game. Can you reach the board, the controls, the rules?
* Can you play a full round and restart without a pointer?
* Can you always see where you are? A control with no visible focus state is a
  dead end, and a custom background or border often suppresses the browser's
  own ring without replacing it.
* Does the focus ring only draw *around* things, or does it reshape them?

### Screen reader semantics

* Does every role describe what the thing **is**? Look specifically for
  `role="img"` on a board and `role="status"` on a button — both replace the
  real role and both are easy to add with good intentions.
* Do switches and toggles set `aria-checked`, and keep it current?
* Does every message that appears on its own — a share confirmation, a hint, an
  error — live in an `aria-live` region? If it only changes visually, it does
  not exist for some players.
* Does anything announce a stale state, or a name that has been temporarily
  overwritten by a confirmation?

---

## Review the end card

This is the surface most likely to be wrong, because it looks finished.

* Can you click the board, the restart button or the rules link **through** it?
* Is the board behind it still in the tab order? Still in the accessibility
  tree? `opacity` and `pointer-events` leave both intact.
* Where does focus go when it opens? It should be the replay control.
* Does Enter replay immediately?
* Does Escape dismiss it, and does the page become usable again afterwards?
* Does focus return where it came from?
* Does anything on it move after it appears — a line that arrives from the
  network, a label that grows? Watch the replay button specifically: it must
  not shift under the player's thumb.

And the design question underneath all of those:

> Is this modal asking the player for something? It should not be. Modals are
> for reading. If there is an ask, it goes inline, and it never blocks replay.

---

## Review sound

* Does the game make a noise? Then: is there a mute, is it reachable on the
  main screen, and does it persist?
* Switch tabs, come back, play. Is there still sound? An audio context that was
  suspended and never resumed is silent for the rest of the session, and this
  is invisible unless you test for it.
* Does muting here mute the rest of the site?

---

## Review motion under a reduced-motion preference

Emulate `prefers-reduced-motion: reduce` — do not read the stylesheet and
assume.

* Is anything still animating forever?
* Is the page still **correct**? Look for elements stuck visible that should
  have faded out, and elements missing that should be there. An animation that
  ends at `opacity: 0` and gets switched off leaves its element on screen.
* Did an affordance disappear with the motion? If a pulse showed which targets
  were valid, something static has to say so instead.
* Check specificity: an override on a less specific selector than the rule it
  is overriding reads correctly and does nothing.

---

## Review the device, not just the window

* Is `viewport-fit=cover` set? If the CSS uses `env(safe-area-inset-*)` without
  it, that padding is silently zero.
* Measure the controls. Anything under 44x44 is a defect — including back
  links, disclosure summaries, difficulty pills and icon buttons, which are the
  ones that get missed. Measure the *hit area*, not the ink.
* Do any enlarged hit areas overlap each other?
* Is every `:hover` rule gated behind `(hover: hover) and (pointer: fine)`?
  Tap a control on a touch screen: does it stay looking hovered?
* Turn the phone sideways. 844x390 is a real size and the layout was not drawn
  for it.
* Is any text a player is meant to read under 11px?

---

## Review the copy

* Does the replay button say the same thing as every other game? Does the share
  confirmation?
* Does one glyph carry more than one meaning across the site?
* Does any confirmation claim something that did not happen?
* Does a control relabel itself, losing its own name while the message shows?
* Does a static default in the markup say something wrong before the JavaScript
  corrects it — a loss title on a card that has not been lost yet?

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
8. What cannot be operated without a mouse
9. What moves, or can move, that the player did not move

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

## Review Colour Relationships

Inspect the complete screen and identify colour combinations that feel visually disconnected or accidental.

Check whether:

* The game board clashes with the page background
* Warm and cool colours feel unintentionally conflicting
* Accent colours compete with each other
* Saturation is inconsistent
* A game object looks imported from a different visual style
* Shadows or textures make one element feel more realistic than the rest of the interface

Do not preserve existing colours automatically.

If a colour conflicts with the active theme, determine whether to adjust:

* The game object
* The surrounding surface
* The saturation
* The warmth
* The brightness
* The texture
* The shadow treatment

Preserve game identity, but ensure the full screen feels visually intentional.
