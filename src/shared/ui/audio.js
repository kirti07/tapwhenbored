/* Procedural audio for every game, plus the site-wide mute preference.
 * The AudioContext is resumed on any input and on becoming visible, since
 * browsers suspend it outside gestures and in background tabs.
 */

import { get, set } from "./prefs.js";

var SOUND_KEY = "sound";

var actx = null;
var on = get(SOUND_KEY, "true") !== "false";
var listeners = [];
var wired = false;

/* Created on demand, never at module load, to avoid Chrome's autoplay warning. */
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

/* Deliberately never creates a context. */
function resume() {
  if (!actx) return;
  if (actx.state === "suspended") {
    try { actx.resume(); } catch (e) { /* ignore */ }
  }
}

/* Capturing so a game's stopPropagation cannot starve the resume. */
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

export function isOn() {
  return on;
}

function setOn(value) {
  on = !!value;
  set(SOUND_KEY, on ? "true" : "false");
  if (on) resume();
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](on); } catch (e) { /* a bad listener must not break audio */ }
  }
  return on;
}

function toggle() {
  return setOn(!on);
}

/**
 * Wire a mute button: icon state, aria state and click. `onEnable` plays the
 * game's confirmation note when sound comes back.
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
function onChange(fn) {
  listeners.push(fn);
  try { fn(on); } catch (e) { /* ignore */ }
}

/** One oscillator, one gain envelope, no files. `type` defaults to "sine". */
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
    /* setValueAtTime, not `g.gain.value =`, so a delayed note fades from `at`. */
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur);
  } catch (e) { /* audio not available, ignore */ }
}

wire();
