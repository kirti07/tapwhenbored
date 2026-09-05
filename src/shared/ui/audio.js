/* One procedural audio helper for every game, and one mute preference.
 *
 * Seven games each carried a near-identical copy of `tone()` and a lazily
 * created AudioContext. Four signatures had drifted apart between them
 * (`type` present or hardcoded, `delay` present or not), which is the usual
 * shape of copy-paste rot: the same function, subtly different, in seven files.
 *
 * Two behaviours the copies mostly got wrong:
 *
 * `resume()`. An AudioContext created outside a user gesture starts suspended,
 * and one that was running gets suspended again when the tab goes to the
 * background. Only three of the eight games ever called resume(), so in the
 * other five a tab switch could silently kill audio for the rest of the
 * session. Here the context is resumed on the first input of any kind and
 * again whenever the page becomes visible, so it recovers by itself.
 *
 * Mute. Only two games had one, and they agreed on the storage key by comment
 * rather than by code. The preference is site-wide and lives in prefs.js, so
 * muting in one game mutes the shelf.
 *
 * `tone(freq, dur, type, gain, delay)` is the superset of the four signatures
 * that existed; the two games whose local helper hardcoded "sine" keep a
 * one-line wrapper rather than having their call sites rewritten.
 */

import { get, set } from "./prefs.js";

var SOUND_KEY = "sound";

var actx = null;
var on = get(SOUND_KEY, "true") !== "false";
var listeners = [];
var wired = false;

/* Created on demand, never at module load: constructing an AudioContext before
   any interaction is what makes Chrome log an autoplay warning on a page that
   may never make a sound at all. */
function ctx() {
  if (!actx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === "suspended") {
    try { actx.resume(); } catch (e) { /* ignore */ }
  }
  return actx;
}

/* Nudge a suspended context back to life. Safe to call when there is no
   context yet — it deliberately does not create one, so a page the player
   never interacts with audibly still constructs nothing. */
export function resume() {
  if (!actx) return;
  if (actx.state === "suspended") {
    try { actx.resume(); } catch (e) { /* ignore */ }
  }
}

/* The recovery this file exists for. `pointerdown`/`keydown` cover the gesture
   requirement on first play; `visibilitychange` covers the tab switch that
   used to leave five games permanently silent. Passive and capturing so a
   game's own stopPropagation on its board cannot starve them. */
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  var opts = { passive: true, capture: true };
  window.addEventListener("pointerdown", resume, opts);
  window.addEventListener("keydown", resume, opts);
  window.addEventListener("touchstart", resume, opts);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) resume();
  });
}

/** Is sound currently on? */
export function isOn() {
  return on;
}

/** Set the site-wide sound preference and notify any UI bound to it. */
export function setOn(value) {
  on = !!value;
  set(SOUND_KEY, on ? "true" : "false");
  if (on) resume();
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](on); } catch (e) { /* a bad listener must not break audio */ }
  }
  return on;
}

/** Flip the preference. Returns the new value. */
export function toggle() {
  return setOn(!on);
}

/**
 * Wire a mute button: the icon state, the announced state, and the click.
 *
 * This was the same five lines in six games and a drifted seventh, all of them
 * getting the aria right by copy rather than by contract.
 *
 * `onEnable` plays a confirmation when sound comes back, which is the one part
 * that genuinely differs per game — each has its own note, and honeycomb passes
 * nothing because it deliberately stays quiet.
 */
export function initSoundToggle(btn, onEnable) {
  if (!btn) return;
  onChange(function (isOn) {
    btn.classList.toggle("is-off", !isOn);
    btn.setAttribute("aria-pressed", isOn ? "true" : "false");
    btn.setAttribute("aria-label", isOn ? "Sound on" : "Sound off");
  });
  btn.addEventListener("click", function () {
    if (toggle() && onEnable) onEnable();
    resume();
  });
}

/** Subscribe to preference changes. Fires immediately with the current value. */
export function onChange(fn) {
  listeners.push(fn);
  try { fn(on); } catch (e) { /* ignore */ }
}

/**
 * One oscillator, one gain envelope, no files.
 *
 * `type` and `delay` are optional — the two games whose local helper always
 * used a sine wave pass undefined and get "sine".
 */
export function tone(freq, dur, type, gain, delay) {
  if (!on) return;
  wire();
  try {
    var c = ctx();
    if (!c) return;
    var at = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    /* setValueAtTime before the ramp, not `g.gain.value =`: with a non-zero
       delay the bare assignment applies now rather than at `at`, so the note
       fades from its start instead of from when it sounds. */
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur);
  } catch (e) { /* audio not available, ignore */ }
}

wire();
