/* The lobby's "How to play": a bar pinned above Start (or the waiting line)
 * that opens a sheet with the room's game's rules, for a group playing it
 * for the first time.
 *
 * Loaded by the party page when a lobby first shows, so the rules for five
 * games never weigh on /party/ itself. Open, close, Escape and the focus trap
 * are the site's own sheet (initHowto); this module adds the words and builds
 * the DOM — with textContent only — once per game.
 */

import { initHowto } from "../shared/ui/shell.js";
import { MAX_ANSWER, minPlayers, maxPlayers } from "./rules.js";
import "./how-to.css";

/* Per game: the chips, the idea, the steps, how it ends, and one tip.
 * `cap` is the host's time limit, in seconds; `players` the room's range. */
const RULES = {
  "sounds-sus": (cap, players) => ({
    chips: [players, "~5–15 min", "1 spy"],
    idea: "Everyone gets the same secret word, except one player: the spy, whose card just says SPY. Find the spy before they blend in.",
    steps: [
      ["Check your card", "Tap Reveal my card, read it, then Hide & ready. Nobody else can see it, so keep a straight face."],
      ["Give one clue each", `Go round in the order on screen. Say one word or a short phrase, out loud, that shows you know the word. Never the word itself, and not a clue so easy it gives the word away. The spy bluffs. You have ${cap} seconds; tap Done when you've spoken.`],
      ["Talk it over", "Who sounded vague? Who copied someone? You have a minute to argue it out; the host can start the vote sooner."],
      ["Vote someone out", "Everyone votes in secret. Most votes is out; a tie means nobody. If it wasn't the spy, they sit out the rest of the game, and a new lap of clues starts."],
      ["Spy caught? One last guess", "The spy gets one guess at the word, out loud. Everyone else knows the word, so any of you taps whether they got it."],
    ],
    endsLabel: "How it ends",
    ends: [
      ["🎉", "The spy is voted out and guesses wrong: the room wins."],
      ["🎯", "The spy is voted out but guesses the word: the spy wins."],
      ["🕵️", "The spy lasts to the final two: the spy wins."],
    ],
    tip: "Clue tip: too obvious and the spy learns the word; too vague and you start to sound like the spy.",
  }),
  "humour-me": (cap, players) => ({
    chips: [players, "~2 min", `${cap} sec to write`],
    idea: "Everyone gets the same unfinished phrase. Write the funniest ending you can, then the room votes for its favourite, without knowing who wrote what.",
    steps: [
      ["Read the phrase", "It's the same on every phone, like “The real reason I'm late is ___.”"],
      ["Write your ending", `You have ${cap} seconds and ${MAX_ANSWER} characters. Funny beats clever; short beats long.`],
      ["Vote for the funniest", "Answers show up with no names. Tap your favourite; you can't pick your own. Reading them out loud is half the fun."],
    ],
    endsLabel: "Who wins",
    ends: [["🏆", "The answer with the most votes wins. Ties share the win."]],
    tip: "Tip: if you're stuck, write the first thing that makes you laugh. You can't edit after you submit.",
  }),
  "doodle-on": (cap, players) => ({
    chips: [players, "~1 min", `${cap} sec to draw`],
    idea: "Everyone gets the same shape and the same idea, like “turn this circle into something dangerous”. Draw it, then the room votes for the best doodle, without knowing who drew what.",
    steps: [
      ["See the prompt", "The shape is already on your page. The title card says what to turn it into."],
      ["Draw", `You have ${cap} seconds. Tap Done when you're happy; give it a name if you like. It stays secret until the end.`],
      ["Vote for the best", "Every doodle shows up with no names. Tap your favourite; you can't pick your own."],
    ],
    endsLabel: "Who wins",
    ends: [["🏆", "The doodle with the most votes wins. Ties share the win."]],
    tip: "Tip: a quick, funny doodle beats a slow, careful one. Don't hand in a blank page.",
  }),
  "flip-it": (cap, players) => ({
    chips: [players, `${cap} sec`, "Same board"],
    idea: "Everyone gets the same board of lit tiles at the same moment. Race to turn them all off.",
    steps: [
      ["Tap a tile", "It flips, and so do the tiles directly above, below, left and right of it."],
      ["Turn every tile off", "Plan a few taps ahead: every tap changes its neighbours too."],
    ],
    endsLabel: "Who wins",
    ends: [["🏆", "The fastest clear wins. Not finished when time runs out counts as didn't finish."]],
    tip: "Tip: work row by row from the top, then clean up the bottom.",
  }),
  "slide-n-order": (cap, players) => ({
    chips: [players, `${cap} sec`, "Same board"],
    idea: "Everyone gets the same scrambled 4×4 board at the same moment. Slide the tiles back into order, 1 to 15.",
    steps: [
      ["Slide a tile", "Tap a tile next to the empty space to slide it in."],
      ["Put 1 to 15 in order", "Left to right, top to bottom, with the empty space last."],
    ],
    endsLabel: "Who wins",
    ends: [["🏆", "Fewest moves wins; the faster time breaks a tie."]],
    tip: "Tip: finish the top row first, then the second, then solve the last two rows together.",
  }),
};

let shown = ""; // the game and time limit the bar and sheet were built for
let parts = null; // { bar, sheet, backdrop, ctl }

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** The bar and the sheet for `room`'s game, in `dock`. Cheap to call on
 *  every lobby render: it rebuilds only when the game or limit changes. */
export function mount(dock, room, icon, title, onOpen) {
  const key = `${room.game}:${room.cap}`;
  if (key === shown && parts?.bar.isConnected) return;
  shown = key;
  close();
  parts?.bar.remove();
  parts?.sheet.remove();
  parts?.backdrop.remove();

  const r = RULES[room.game](room.cap, `${minPlayers(room.game)}–${maxPlayers(room.game)} players`);
  const tile = () => {
    const t = el("span", "ht-tile");
    t.appendChild(icon());
    return t;
  };

  // A small centred pill: quiet on screen, one tap from the rules.
  const bar = el("button", "ht-bar");
  bar.type = "button";
  bar.append(el("span", "ht-i"), `How to play ${title}`);
  dock.prepend(bar);

  const backdrop = el("div", "howto-backdrop");
  const sheet = el("div", "howto-sheet ht-sheet");
  const head = el("div", "ht-head");
  const close_ = el("button", "ht-x");
  close_.type = "button";
  close_.setAttribute("aria-label", "Close");
  const names = el("div", "ht-names");
  names.append(el("p", "ht-k arc-pix", "How to play"), el("h2", "howto-title ht-title", title));
  const row = el("div", "ht-row");
  row.append(tile(), names, close_);
  const chips = el("p", "ht-chips");
  for (const c of r.chips) chips.appendChild(el("span", "ht-chip arc-pix", c));
  head.append(el("div", "howto-handle"), row, chips);

  const body = el("div", "ht-body");
  const idea = el("div", "ht-idea");
  idea.append(el("p", "ht-k arc-pix", "The idea"), el("p", "", r.idea));
  const steps = el("ol", "ht-steps");
  for (const [h, t] of r.steps) {
    const li = el("li");
    li.append(el("strong", "", h), el("span", "", t));
    steps.appendChild(li);
  }
  const ends = el("ul", "ht-ends");
  for (const [mark, t] of r.ends) {
    const li = el("li");
    li.append(el("span", "ht-mark", mark), el("span", "", t));
    ends.appendChild(li);
  }
  body.append(idea, steps, el("p", "ht-k ht-k--dim arc-pix", r.endsLabel), ends, el("p", "ht-tip", `💡 ${r.tip}`));

  const foot = el("div", "ht-foot");
  const ok = el("button", "arc-btn arc-btn--primary party-cta ht-ok", "Got it");
  ok.type = "button";
  foot.appendChild(ok);
  sheet.append(head, body, foot);
  document.body.append(backdrop, sheet);

  // The page behind goes inert while the sheet is up; the sheet is outside it.
  const ctl = initHowto({ btn: bar, sheet, backdrop, inertRoot: document.querySelector(".wrap"), onOpen });
  close_.addEventListener("click", ctl.close);
  ok.addEventListener("click", ctl.close);
  parts = { bar, sheet, backdrop, ctl };
}

/** Close the sheet if it is open — the round started, or the game changed. */
export function close() {
  if (parts?.ctl.isOpen()) parts.ctl.close();
}
