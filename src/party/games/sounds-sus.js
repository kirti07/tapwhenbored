/* Sounds Sus, the party page's part: every screen between the title card and
 * the reveal.
 *
 * The server works out where the game is (api/_lib/sounds-sus.js) because
 * only it knows the spy, and sends it as `room.sus`: the phase, the lap, who
 * is still in, the speaking order, finished laps' votes — and, once over, the
 * spy and the word. This module draws that. The one secret a phone holds is
 * its own card, fetched with `card`. Loaded only when a room picks the game.
 */

import "./sounds-sus.css";

let card = null; // { code, word } or { code, spy: true }
let peek = false; // the card is face up
let myVote = null; // { key, seat }: this phone's vote in this lap
let clock = null; // the clock's element, ticked every frame
let drawnFor = "";

/** The title card: the rules in one line each, and each speaker's time. */
export function title(room) {
  return ["One of you sees SPY. Give one clue each, then vote someone out.", `${room.cap} sec per clue`, "30 sec to vote"];
}

export function render(screen, c) {
  const s = c.room.sus;
  if (clock) clock.textContent = s.endsAt == null ? "" : c.time(Math.max(0, s.endsAt - c.now()));
  if (card?.code !== c.room.code) {
    card = { code: c.room.code };
    peek = false;
    c.act("card").then((d) => { if (d) card = { code: c.room.code, ...d }; drawnFor = ""; });
  }
  const key = JSON.stringify([s, peek, myVote, card]);
  if (key === drawnFor) return;
  drawnFor = key;
  draw(screen, c, s);
}

function draw(screen, c, s) {
  const { room, me, el, isHost } = c;
  const out = !s.alive.includes(me.seat) && s.phase !== "card";
  const who = (seat) => room.players.find((p) => p.seat === seat);
  const name = (seat) => (seat === me.seat ? "You" : who(seat).name);
  const faceOf = (seat) => c.face(who(seat).emoji);
  const button = (text, cls, onClick) => {
    const b = el("button", `arc-btn ${cls} party-cta`, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  };
  const redraw = () => { drawnFor = ""; render(screen, c); };
  screen.textContent = "";

  // The bar: the lap and phase, the clock, and a count that fits the phase.
  const label = { card: "Your card", talk: `Lap ${s.lap} · clues`, vote: `Lap ${s.lap} · vote`, out: `Lap ${s.lap} · result` }[s.phase];
  const [k, v] = {
    card: ["Ready", `${(s.ready || []).length} / ${s.alive.length}`],
    talk: ["Still in", String(s.alive.length)],
    vote: ["Voted", `${(s.voted || []).length} / ${s.alive.length}`],
    out: ["Still in", String(s.alive.length)],
  }[s.phase];
  const bar = el("div", "partybar arc-screen");
  const left = el("span", "pb-round");
  left.append(el("span", "pb-r arc-pix", "Sounds Sus"), el("span", "pb-g arc-pix", out ? "Watching" : label));
  clock = el("span", "pb-clock arc-mono");
  clock.setAttribute("role", "timer");
  const right = el("span", "pb-done");
  right.append(el("span", "pb-k arc-pix", k), el("span", "arc-mono", v));
  bar.append(left, clock, right);
  screen.appendChild(bar);
  const err = el("p", "party-err");
  err.setAttribute("role", "alert");
  const act = (type, extra) => c.act(type, extra, err);

  // The card: face down until its owner holds it up.
  const cardEl = (big) => {
    const f = el("div", `ss-card${peek ? (card.spy ? " is-spy" : " is-word") : ""}${big ? "" : " ss-card--small"}`);
    if (!peek) f.append(el("span", "ss-q arc-pix", "?"), el("span", "ss-cap arc-pix", "Secret card"));
    else if (card.spy) f.append(el("span", "ss-w arc-pix", "SPY"), el("span", "ss-cap arc-pix", "You don't know the word"));
    else f.append(el("span", "ss-w", card.word || "…"), el("span", "ss-cap arc-pix", "The secret word"));
    return f;
  };
  const peekBtn = (cls) => button(peek ? "Hide my card" : "Peek at my card", cls, () => { peek = !peek; redraw(); });

  if (s.phase === "card") {
    const ready = (s.ready || []).includes(me.seat);
    screen.append(cardEl(true), el("p", "ss-hint", peek
      ? card.spy ? "Listen to the clues. Blend in. Don't get caught." : "Give a clue that proves you know it, without giving it away."
      : ready ? "Ready. Waiting for everyone else…" : "Only you can see it. Keep a straight face."));
    if (!ready && !peek) screen.append(button("Reveal my card", "arc-btn--primary", () => { peek = true; redraw(); }));
    else if (!ready) screen.append(button("Hide & ready", "arc-btn--primary", () => { peek = false; act("ready"); redraw(); }));
    else screen.append(peekBtn("arc-btn--ghost"));
  }

  if (out) {
    const me_ = el("div", "ss-out");
    me_.append(el("span", "ss-face is-out", faceOf(me.seat)), el("p", "ss-big", "You're out"),
      el("p", "ss-hint", "You weren't the spy, but the room thought so. No hints from the sidelines."));
    screen.appendChild(me_);
  }

  if (s.phase === "talk") {
    const now_ = s.speaker;
    const head = el("div", "ss-now");
    if (now_ == null) head.append(el("p", "ss-k arc-pix", "Everyone's spoken"), el("p", "ss-big", "Who sounds sus?"));
    else head.append(el("p", "ss-k arc-pix", now_ === me.seat ? "Your turn" : "Now speaking"), el("span", "ss-face", faceOf(now_)),
      el("p", "ss-big", name(now_)), el("p", "ss-hint", "One clue, out loud. Don't say the word."));
    screen.appendChild(head);
    if (now_ === me.seat) screen.append(button("Done", "arc-btn--primary", () => act("said")));
    const list = el("ol", "ss-order");
    const outs = s.laps.map((l) => l.out).filter((x) => x != null);
    for (const seat of [...s.order, ...outs]) {
      const li = el("li", outs.includes(seat) ? "is-out" : seat === now_ ? "is-now" : "");
      li.append(el("span", "ss-f", faceOf(seat)), el("span", "ss-n", name(seat)),
        el("span", "ss-tag arc-pix", outs.includes(seat) ? "Out" : seat === now_ ? "Talking" : s.order.indexOf(seat) < s.order.indexOf(now_ ?? -1) || now_ == null ? "✓" : ""));
      list.appendChild(li);
    }
    screen.append(el("p", "arc-label", "Speaking order"), list);
    if (!out) screen.append(peekBtn("arc-btn--ghost"), peek ? cardEl(false) : "");
    if (isHost) screen.append(button("Start voting", "arc-btn--primary", () => act("call")));
  }

  if (s.phase === "vote" && !out) {
    const lapKey = `${room.code}:${s.lap}`;
    const mine = myVote?.key === lapKey ? myVote.seat : null;
    screen.append(el("h2", "vote-h", "Who sounds sus?"), el("p", "party-p vote-p", "Secret vote. Most votes is out; a tie, nobody."));
    const grid = el("ul", "ss-grid");
    for (const seat of s.alive) {
      if (seat === me.seat) continue;
      const b = el("button", `ss-tile${seat === mine ? " is-picked" : ""}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(seat === mine));
      b.append(el("span", "ss-f", faceOf(seat)), el("span", "ss-n", who(seat).name));
      b.addEventListener("click", async () => {
        const before = myVote;
        myVote = { key: lapKey, seat };
        redraw();
        if (!(await act("accuse", { target: seat }))) { myVote = before; redraw(); }
      });
      const li = el("li");
      li.appendChild(b);
      grid.appendChild(li);
    }
    screen.appendChild(grid);
  } else if (s.phase === "vote") {
    screen.append(el("p", "ss-hint", "The room is voting…"));
  }

  if (s.phase === "out") {
    const last = s.laps[s.laps.length - 1];
    const head = el("div", "ss-now");
    if (last.out == null) head.append(el("p", "ss-k arc-pix", "A tie"), el("p", "ss-big", "Nobody's out"), el("p", "ss-hint", "The spy is still among you."));
    else head.append(el("span", "ss-face is-out", faceOf(last.out)), el("p", "ss-big", `${name(last.out)} ${last.out === me.seat ? "are" : "is"} out`),
      el("p", "ss-hint", `${name(last.out)} ${last.out === me.seat ? "weren't" : "wasn't"} the spy.`), el("p", "ss-k arc-pix ss-warn", "The spy is still among you"));
    screen.append(head, votesList(c, last.votes, name, faceOf));
    if (isHost) screen.append(button("Next lap", "arc-btn--primary", () => act("lap")));
    else screen.append(el("p", "party-wait", "Waiting for the host…"));
  }

  screen.appendChild(err);
  if (isHost) {
    screen.append(button("End game", "arc-btn--ghost ss-end", () => {
      if (confirm("End the game now? The spy and the word are revealed, and nobody wins.")) act("end");
    }));
  }
}

/** A lap's votes: who got them, most first, and from whom. */
function votesList(c, votes, name, faceOf) {
  const by = {};
  for (const [voter, to] of Object.entries(votes)) (by[to] ||= []).push(Number(voter));
  const list = c.el("ul", "ss-votes");
  for (const [to, from] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    const li = c.el("li");
    li.append(c.el("span", "ss-f", faceOf(Number(to))), c.el("span", "ss-n", name(Number(to))),
      c.el("span", "ss-from", `from ${from.map(faceOf).join(" ")}`), c.el("span", "ss-v arc-mono", c.plural(from.length, "vote")));
    list.appendChild(li);
  }
  return list;
}

/** The reveal: who won, the spy, the word, and the final vote. */
export function final(box, c) {
  const { room, el, nameOf, face } = c;
  const o = room.sus.over;
  box.textContent = "";
  const spyFace = face(room.players.find((p) => p.seat === o.spy).emoji);
  const last = room.sus.laps[room.sus.laps.length - 1];
  const reveal = el("div", "ss-reveal");
  reveal.append(el("span", "ss-face is-spy", spyFace), el("p", "ss-big", `${nameOf(o.spy)} was the spy`),
    el("p", "ss-hint", `The word was ${o.word}.`));
  box.appendChild(reveal);
  if (last) box.append(el("p", "arc-label", `Lap ${room.sus.laps.length} vote`),
    votesList(c, last.votes, nameOf, (seat) => face(room.players.find((p) => p.seat === seat).emoji)));
  const h = { room: "The room wins.", spy: "The spy wins.", host: "Game ended.", left: "The spy left." }[o.by];
  const sub = { room: `Caught in lap ${room.sus.lap}.`, spy: "Only two of you were left.", host: "The host ended it. Nobody wins.", left: "Nobody wins this one." }[o.by];
  return [h, sub];
}
