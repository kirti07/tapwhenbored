/* One region, several states, no layout shift: states share a grid cell
 * (`.arc-slot` in arcade.css) and stay laid out. `inert` removes hidden states
 * from the tab order and accessibility tree, which CSS cannot.
 */

/**
 * Shows the direct `.arc-st` child whose `data-state` is `name`, inerting the
 * rest. An unmatched name hides all of them.
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

