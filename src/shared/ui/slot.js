/* One region, several states, no movement.
 *
 * A board, a name field or a claim block has more to say than fits one shape:
 * loading, empty, error, the thing itself. Swapping them by hiding and showing
 * makes the page jump, and a jump at the moment a result arrives is the worst
 * possible time for one.
 *
 * So every state lives in the same CSS grid cell (see `.arc-slot` in
 * arcade.css) and the region is always as tall as its tallest state. The
 * inactive ones stay laid out — `visibility: hidden`, not `display: none` —
 * because a state with no height cannot hold the box open.
 *
 * That leaves one problem CSS cannot solve: a `visibility: hidden` element is
 * still in the tab order and still read by a screen reader. `inert` is what
 * takes it out of both, and it has to be applied from here because it is an
 * attribute rather than a style. `pointer-events: none` in the stylesheet
 * stops the mouse; it does nothing for a keyboard.
 *
 * The arcade prototypes carried a copy of this on three pages. One copy.
 */

/**
 * Shows the state named `name` in `slot`, and inerts the rest.
 *
 * States are the slot's own `.arc-st` children, each tagged `data-state`.
 * A name that matches nothing hides them all, which is a legitimate state —
 * an empty region that still holds its height.
 *
 * Only direct children, so a slot nested inside a slot does not reach in and
 * flip its parent's siblings.
 */
export function showState(slot, name) {
  if (!slot) return;
  var states = slot.querySelectorAll(":scope > .arc-st");
  for (var i = 0; i < states.length; i++) {
    var state = states[i];
    var on = state.dataset.state === name;
    state.classList.toggle("arc-on", on);
    if (on) state.removeAttribute("inert");
    else state.setAttribute("inert", "");
  }
}

/** Which state is showing, or "" when none is. */
export function currentState(slot) {
  if (!slot) return "";
  var on = slot.querySelector(":scope > .arc-st.arc-on");
  return on ? on.dataset.state || "" : "";
}
