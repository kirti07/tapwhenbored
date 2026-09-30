/* Tap Clash: the party page.
 *
 * A clash is one round of one game: the host picks the game and the time
 * limit, everyone races the same seeded board, and the results are the
 * finale — with Share, a rematch and "host your own" right under them. A
 * rematch is the next round, in a new room everyone follows into.
 *
 * Which screen is on is never stored anywhere: every tick asks
 * src/clash/rules.js where the clash is — `derive(room, now)` on the latest
 * snapshot and the server's clock — and draws that. So a phone that locks,
 * reloads or joins late lands on exactly the screen everyone else is on.
 *
 * The round is the real game page in an iframe (`?clash=1&seed=…`). This page
 * owns the clock: it tells the frame when the round went live and posts the
 * frame's result to the room. The contract is written out in each game.
 *
 * Doodle On adds a vote: the drawings come back as tags with no names, and
 * only the final snapshot says who drew what.
 *
 * Everything a player typed reaches the DOM through textContent. The only
 * innerHTML is the QR code, an SVG built by uqr from this page's own URL.
 */

import * as R from "./rules.js";
import { now, post, postDoodle, doodleUrl, watch, loadSeat, saveSeat } from "./net.js";
import { getJSON, setJSON } from "../shared/ui/prefs.js";
import { getName, setName } from "../shared/ui/player.js";
import { initShare, createNote } from "../shared/ui/shell.js";
import { initToggle as initThemeToggle } from "../shared/ui/theme.js";
import { formatDuration } from "../shared/ui/format.js";

const $ = (id) => document.getElementById(id);
const FACE_KEY = "clash.face";
const GUEST_KEY = "clash.guest"; // read by the homepage's guest line
const DOODLE_KEY = "clash.doodle"; // { code, tag, vote }: this phone's doodle and vote
const TICK_MS = 200;
const PING_MS = 10_000;

const params = new URLSearchParams(location.search);
let code = (params.get("r") || "").toUpperCase();
let me = code ? loadSeat(code) : null; // { seat, token } in this room, or null
let room = null;
let feed = null; // the poller
let screen = null;
let drawnKey = ""; // what the screen was last built from
let pending = null; // this phone's own result: { ms, moves, error? }
const toasted = new Set(); // seats already announced
const listed = new Set(); // seats already on the waiting sheet's list
let frame = null; // { el, code, ready, went, done }
let hostBefore = null;
let wake = null;
let kept = { code: "", tag: "", vote: "" }; // this phone's doodle tag and vote
let gridFor = ""; // the doodles the vote grid was built from

// ---------------------------------------------------------------- helpers --

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const face = (i) => R.FACES[i] || "🙂";
const game = () => R.GAMES[room.game];
const doodle = () => game().by === "votes";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const player = (seat) => room.players.find((p) => p.seat === seat);
const nameOf = (seat) => (player(seat) || { name: "Someone" }).name;
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]);
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const track = (name, extra) => {
  try { window.gtag("event", name, extra || {}); } catch (e) { /* analytics never matters */ }
};

function show(name) {
  if (screen === name) return;
  screen = name;
  for (const s of document.querySelectorAll("[data-screen]")) s.hidden = s.dataset.screen !== name;
  document.body.dataset.view = name;
  if (name === "lobby") keepAwake();
  else if (wake) { wake.release().catch(() => {}); wake = null; }
}

/** A result as the room reads it: moves for Slide N Order, time for Flip It. */
function resultText(r) {
  return game().by === "moves" ? `${r.moves} moves` : formatDuration(r.ms);
}

/** A row of the results: votes for Doodle On, else the result. */
function rowText(x) {
  if (!x.result) return doodle() ? "didn't draw" : "didn't finish";
  return doodle() ? plural(x.votes, "vote") : resultText(x.result);
}

/** This phone's doodle and vote in this room, kept across a reload. */
function myDoodle() {
  if (kept.code !== code) {
    const saved = getJSON(DOODLE_KEY, null);
    kept = saved && saved.code === code ? saved : { code, tag: "", vote: "" };
  }
  return kept;
}
function keepDoodle(change) {
  kept = { ...myDoodle(), ...change };
  setJSON(DOODLE_KEY, kept);
}

/** Emoji buttons as a radio group; returns a getter for the chosen index. */
function facePicker(container, initial) {
  let chosen = initial;
  R.FACES.forEach((f, i) => {
    const b = el("button", "face", f);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", `Face ${i + 1}`);
    b.setAttribute("aria-checked", String(i === chosen));
    b.addEventListener("click", () => {
      chosen = i;
      for (const x of container.children) x.setAttribute("aria-checked", String(x === b));
      setJSON(FACE_KEY, i);
    });
    container.appendChild(b);
  });
  return () => chosen;
}

function savedFace() {
  const f = getJSON(FACE_KEY, null);
  return Number.isInteger(f) && f >= 0 && f < R.FACES.length ? f : Math.floor(Math.random() * R.FACES.length);
}

/**
 * The game and the time limit, as two radio groups. The limits are the
 * game's own presets (rules.js), and switching game resets to its default.
 * Returns a getter for `{ game, cap }`.
 */
function gamePicker(container, initial) {
  let chosen = { ...initial };
  const games = el("div", "pick-games");
  games.setAttribute("role", "radiogroup");
  games.setAttribute("aria-label", "Game");
  const caps = el("div", "pick-caps");
  caps.setAttribute("role", "radiogroup");
  caps.setAttribute("aria-label", "Time limit");

  function radio(parent, cls, checked, onPick) {
    const b = el("button", cls);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(checked));
    b.addEventListener("click", () => {
      for (const x of parent.children) x.setAttribute("aria-checked", String(x === b));
      onPick();
    });
    parent.appendChild(b);
    return b;
  }

  function drawCaps() {
    caps.textContent = "";
    for (const cap of R.GAMES[chosen.game].caps) {
      radio(caps, "pick-cap arc-mono", cap === chosen.cap, () => { chosen.cap = cap; }).textContent = `${cap}s`;
    }
  }

  for (const [slug, g] of Object.entries(R.GAMES)) {
    const b = radio(games, `pick-game pick--${slug}`, slug === chosen.game, () => {
      chosen = { game: slug, cap: g.cap };
      drawCaps();
    });
    b.appendChild(el("strong", "", g.title));
    b.appendChild(el("span", "", g.win));
  }
  drawCaps();

  const label = el("span", "arc-label", "Game");
  const capLabel = el("span", "arc-label", "Time limit");
  container.append(label, games, capLabel, caps);
  return () => chosen;
}

// ------------------------------------------------------------ the room feed --

/** Watch a room, as `seat` if given, else as whatever seat this phone kept. */
function enter(newCode, seat) {
  code = newCode;
  me = seat || loadSeat(code);
  if (seat) saveSeat(code, seat.seat, seat.token);
  history.replaceState(null, "", `/clash/?r=${code}`);
  feed?.stop();
  feed = watch(code, {
    onRoom(r) { room = r; render(); },
    onGone() { room = null; gone("This clash has ended", "Rooms close three hours after they open, or the code was mistyped."); },
    // A player on their own board needs nobody else's news every second.
    relaxed: () => screen === "play" && frame && !frame.done,
  });
}

/** Apply a POST's answer, or show why it failed. Returns the data or null. */
function answer(res, errEl) {
  if (!res.ok) {
    if (errEl) errEl.textContent = explain(res.data.error);
    return null;
  }
  if (errEl) errEl.textContent = "";
  // Only this room's snapshot: a rematch answers with the new room, and a
  // raced one with the old room, and neither belongs in the feed on screen.
  if (res.data.room?.code === code && feed) feed.accept(res.data.room, res.data.serverNow);
  return res.data;
}

function explain(error) {
  return {
    offline: "No connection. Try again in a moment.",
    "room full": "This room is full — ten is the most.",
    "no such room": "No room with that code. Check the letters?",
    "slow down": "Too many tries. Wait a minute and try again.",
    "name required": "Add a name first.",
    "not enough done": "Half the room has to finish before you can call time.",
    "your own": "That one's yours — pick someone else's.",
    "too late": "Too late — the vote is over.",
    "already started": "This clash has already started — joining closed when it began.",
    [`needs ${R.MIN_PLAYERS} players`]: `A clash needs at least ${R.MIN_PLAYERS} players.`,
  }[error] || "That didn't work. Try again.";
}

function mySeat() {
  return me && room ? player(me.seat) : null;
}

/* Analytics that describe the clash, not the phone, fire once and only from
   the host's phone — or ten phones would count one clash ten times. */
const sent = new Set();
function trackOnce(name, extra) {
  const k = `${code}:${name}`;
  if (sent.has(k) || me.seat !== room.host) return;
  sent.add(k);
  track(name, extra);
}

async function act(type, extra, errEl) {
  return answer(await post({ type, code, seat: me.seat, token: me.token, ...extra }), errEl);
}

/* Presence: the host's controls pass on once the host has been quiet for the
   away window, so every phone says it is here for the whole clash — not just
   on the screens with host controls, or a host who played the round would
   come back to the results already replaced. Paced by the room's own scale,
   like the away window it feeds. */
(function ping() {
  if (me && room && !document.hidden) act("ping");
  setTimeout(ping, PING_MS * (room ? room.scale : 1));
})();

// --------------------------------------------------------------- screens --

function gone(h, p) {
  $("goneH").textContent = h;
  $("goneP").textContent = p;
  show("gone");
}

function render() {
  if (!room) return;
  const mine = mySeat();
  if (me && !mine) me = null; // a seat from some other room with this code
  if (!me) return renderJoin();
  if (mine.kickedAt != null) return gone("You were removed from this clash", "The host took you out of the room. You can start one of your own.");

  const d = R.derive(room, now());
  if (d.phase === "final" && room.next) return followRematch();

  const key = `${d.phase}:${JSON.stringify(room)}:${JSON.stringify(pending)}`;
  const fresh = key !== drawnKey;
  drawnKey = key;

  if (d.phase === "lobby" || d.phase === "title" || d.phase === "play") prepareFrame();
  if (d.phase === "lobby") renderLobby(fresh);
  else if (d.phase === "title") renderTitle(d, fresh);
  else if (d.phase === "play") renderPlay(d, fresh);
  else if (d.phase === "vote") renderVote(d, fresh);
  // A Doodle On final needs the tally, which a snapshot cached a moment
  // before the vote closed does not have yet: the next poll brings it.
  else if (!doodle() || room.tally) renderFinal(fresh);
}

setInterval(render, TICK_MS);

// 04 · join ---------------------------------------------------------------

let joinFace = null;
function renderJoin() {
  if (room.start != null) {
    return gone("This clash has already started", "Joining closes when the host starts. Ask for the next one, or start your own.");
  }
  const host = player(room.host) || room.players[0];
  const here = room.players.filter((p) => p.kickedAt == null);
  $("joinCode").textContent = `Room ${room.code}`;
  $("joinBy").textContent = `${host.name} started`;
  $("joinParty").textContent = room.name;
  $("joinWho").textContent = `${here.slice(0, 6).map((p) => face(p.emoji)).join(" ")}  ${here.length} already in`;
  $("joinNote").textContent = `${game().title} · ${room.cap}s · ${doodle() ? "everyone draws, then the room votes" : "one board, everyone at once"}`;
  if (!joinFace) {
    joinFace = facePicker($("joinFaces"), savedFace());
    $("joinName").value = getName();
  }
  show("join");
}

$("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  // One tap, one seat: a second tap while the first is on its way would
  // join twice, and the extra seat would hold the round open to the limit.
  const go = $("joinForm").querySelector("[type=submit]");
  if (go.disabled) return;
  go.disabled = true;
  const name = $("joinName").value;
  const data = answer(await post({ type: "join", code, name, emoji: joinFace() }), $("joinErr"));
  go.disabled = false;
  if (!data) return;
  setName(name);
  track("player_joined");
  enter(data.code, { seat: data.seat, token: data.token });
  feed.accept(data.room, data.serverNow);
});

// 03 · lobby ----------------------------------------------------------------

let qrFor = "";
function renderLobby(fresh) {
  show("lobby");
  const isHost = me.seat === room.host;
  const here = room.players.filter((p) => p.kickedAt == null);

  if (hostBefore !== null && hostBefore !== room.host && isHost) $("hostNote").hidden = false;
  hostBefore = room.host;
  if (!fresh) return;

  $("lobbyName").textContent = room.name;
  $("lobbyGame").textContent = `${game().title} · ${room.cap}s`;
  const url = `${location.origin}/clash/?r=${room.code}`;
  $("lobbyUrl").textContent = url.replace(/^https?:\/\/(www\.)?/, "");
  const tiles = $("codeTiles");
  tiles.textContent = "";
  tiles.setAttribute("aria-label", `Room code ${room.code.split("").join(" ")}`);
  for (const ch of room.code) tiles.appendChild(el("span", "tile", ch));
  if (qrFor !== url) {
    qrFor = url;
    import("uqr").then(({ renderSVG }) => {
      $("qr").innerHTML = renderSVG(url, { border: 1, whiteColor: "#fff", blackColor: "#141527" });
    });
  }

  $("roomCount").textContent = `In the room · ${here.length}`;
  $("roomHint").textContent = isHost && here.length > 1 ? "tap × to remove" : "";
  const list = $("roomList");
  list.textContent = "";
  for (const p of here) {
    const li = el("li", "room-row" + (p.seat === me.seat ? " is-me" : ""));
    li.appendChild(el("span", "room-face", face(p.emoji)));
    li.appendChild(el("span", "room-name", p.name + (p.seat === me.seat ? " (you)" : "")));
    if (p.seat === room.host) li.appendChild(el("span", "arc-chip room-host", "Host"));
    else if (isHost) {
      const x = el("button", "room-kick", "×");
      x.type = "button";
      x.setAttribute("aria-label", `Remove ${p.name}`);
      x.addEventListener("click", () => act("kick", { target: p.seat }, $("lobbyErr")));
      li.appendChild(x);
    }
    list.appendChild(li);
  }

  const start = $("startBtn");
  start.hidden = !isHost;
  start.disabled = here.length < R.MIN_PLAYERS;
  start.textContent = here.length < R.MIN_PLAYERS
    ? `Waiting for ${R.MIN_PLAYERS - here.length} more`
    : `Start · ${here.length} players`;
  $("lobbyWait").hidden = isHost;
  $("lobbyWait").textContent = `Waiting for ${nameOf(room.host)} to start…`;
}

$("startBtn").addEventListener("click", async () => {
  const data = await act("start", {}, $("lobbyErr"));
  if (data) trackOnce("round_started", { game: room.game, cap: room.cap });
});

initShare({
  btn: $("inviteBtn"),
  note: $("inviteNote"),
  title: "Tap Clash",
  text: () => `Join my Tap Clash "${room.name}" — ${game().title}, room ${room.code}.`,
  url: () => `${location.origin}/clash/?r=${room.code}`,
});

/* The host's phone is what guests scan, so it should not sleep. Wake Lock is
   Safari 16.4+; where it is missing, say so instead. */
async function keepAwake() {
  const note = $("wakeNote");
  if (!("wakeLock" in navigator)) { note.hidden = false; return; }
  try { wake = await navigator.wakeLock.request("screen"); } catch { note.hidden = false; }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && screen === "lobby" && !wake) keepAwake();
});

// 05 · title card -------------------------------------------------------------

function renderTitle(d, fresh) {
  show("title");
  const left = Math.ceil((d.playAt - now()) / 1000);
  $("titleCount").textContent = String(Math.max(1, Math.min(3, left)));
  if (!fresh) return;
  document.body.dataset.game = room.game;
  $("titleGame").textContent = game().title;
  if (doodle()) {
    const p = R.doodleRound(room);
    $("titleRule").textContent = `Turn this ${p.shape} into ${p.direction}.`;
    $("titleCap").textContent = `${room.cap} sec to draw`;
    $("titleChip").textContent = `${R.VOTE_MS / 1000} sec to vote`;
  } else {
    $("titleRule").textContent = `${game().rule} ${game().win}`;
    $("titleCap").textContent = `${room.cap} sec`;
    $("titleChip").textContent = "Same board for all";
  }
  $("titleFoot").textContent = `${R.eligible(room, d.playAt).length} players ready`;
}

// 06 · playing ------------------------------------------------------------------

/* The board loads in the lobby, behind everything, so it is ready before the
   title card ends. One frame per room. */
function prepareFrame() {
  if (frame?.code === room.code) return;
  frame?.el.remove();
  const g = game();
  const f = el("iframe", "round-frame");
  f.title = g.title;
  f.src = `/${room.game}/?clash=1&seed=${room.seed.toString(36)}${g.level ? `&level=${g.level}` : ""}`;
  $("frameSlot").appendChild(f);
  frame = { el: f, code: room.code, ready: false, went: false, done: false };
}

window.addEventListener("message", (e) => {
  if (!frame || e.origin !== location.origin || e.source !== frame.el.contentWindow) return;
  if (e.data?.type === "ready") {
    frame.ready = true;
    render();
  } else if (e.data?.type === "result") submit(e.data);
});

async function submit(r) {
  if (pending) return;
  frame.done = true;
  pending = { ms: r.ms, moves: r.moves };
  let send = () => post({ type: "result", code, seat: me.seat, token: me.token, seed: r.seed, ms: r.ms, moves: r.moves });
  if (doodle()) {
    // A blank page is no doodle: nothing to send, and it did not count.
    if (!(r.image instanceof Blob)) {
      pending = { ...pending, blank: true };
      return render();
    }
    // Stopped at 0:00 by this page's clock, which the frame's can overshoot.
    const d = R.derive(room, now());
    const ms = Math.min(r.ms, d.deadline - d.playAt);
    pending.ms = ms;
    send = () => postDoodle({ type: "doodle", code, seat: me.seat, token: me.token, seed: r.seed, ms }, r.image);
  }
  render();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await send();
    if (res.ok) {
      if (res.data.tag) keepDoodle({ tag: res.data.tag });
      answer(res);
      return;
    }
    if (res.status !== 0 && res.status !== 503) break; // refused, not lost
    await new Promise((ok) => setTimeout(ok, 800));
  }
  pending = { ...pending, error: true };
  render();
}

function renderPlay(d, fresh) {
  show("play");
  const t = now();
  const eligible = R.eligible(room, d.playAt);
  const playing = eligible.some((p) => p.seat === me.seat);
  const mine = room.results[me.seat] || pending;

  // Go, once the frame is ready: tell it how long ago the round began, and
  // Doodle On what to draw.
  if (playing && !mine && frame.ready && !frame.went) {
    frame.went = true;
    const go = { type: "go", elapsed: t - d.playAt };
    if (doodle()) {
      const p = R.doodleRound(room);
      Object.assign(go, { shape: p.shape, direction: p.direction });
    }
    frame.el.contentWindow.postMessage(go, location.origin);
    frame.el.focus();
  }
  // Doodle On hands its drawing in at 0:00, on this page's clock.
  if (doodle() && frame.went && !frame.done && !frame.stopped && t >= d.deadline) {
    frame.stopped = true;
    frame.el.contentWindow.postMessage({ type: "stop" }, location.origin);
  }

  const left = Math.max(0, d.deadline - t);
  $("pbClock").textContent = formatDuration(left + 999);
  $("pbFill").style.width = `${(100 * left) / (d.deadline - d.playAt)}%`;
  const { done, of } = R.progress(room);
  $("pbDone").textContent = `${done} / ${of}`;

  if (!fresh) return;
  document.body.dataset.game = room.game;
  $("pbGame").textContent = game().title;

  // "Riya cleared it in 0:31" — once per finisher, never for yourself.
  for (const [seat, r] of Object.entries(room.results)) {
    if (toasted.has(seat) || Number(seat) === me.seat) continue;
    toasted.add(seat);
    const who = `${face(player(Number(seat)).emoji)} ${nameOf(Number(seat))}`;
    if (doodle()) toast(`✏️ ${who} is done`);
    else toast(`${who} ${game().by === "moves" ? "solved it in" : "cleared it in"} ${resultText(r)}`);
  }

  // Finished, or not in this round: wait here with the room, not elsewhere.
  const sheet = $("sheet");
  sheet.hidden = playing && !mine;
  document.body.classList.toggle("is-waiting", !sheet.hidden);
  if (sheet.hidden) return;

  if (!playing) {
    $("sheetH").textContent = "You're in for the next one";
    $("sheetSub").textContent = `Watching ${game().title} — the rematch brings you in.`;
  } else if (pending?.error) {
    $("sheetH").textContent = doodle() ? "Your doodle didn't reach the room" : "Your result didn't reach the room";
    $("sheetSub").textContent = doodle() ? "You can still vote." : "It counts as didn't finish.";
  } else if (pending?.blank) {
    $("sheetH").textContent = "Nothing drawn";
    $("sheetSub").textContent = "A blank page doesn't count — you can still vote.";
  } else if (doodle()) {
    $("sheetH").textContent = "Your doodle's in";
    $("sheetSub").textContent = `Handed in at ${formatDuration(mine.ms)}`;
  } else {
    const place = R.placements(room).find((x) => x.seat === me.seat)?.place;
    $("sheetH").textContent = game().by === "moves" ? `Solved in ${mine.moves} moves` : `Cleared in ${formatDuration(mine.ms)}`;
    $("sheetSub").textContent = `${formatDuration(mine.ms)} · ${mine.moves} moves${place ? ` · ${ordinal(place)} so far` : ""}`;
  }
  // Who has finished, ranked so far — for Slide N Order that is by moves,
  // not by who got there first. Everyone else is one line under it.
  $("sheetLabel").textContent = `Finished · ${done} of ${of}`;
  const list = $("sheetList");
  list.textContent = "";
  // Doodle On has no order until the vote, so its list is who is done.
  for (const x of R.placements(room)) {
    if (!x.result) continue;
    const isMe = x.seat === me.seat;
    const isNew = !listed.has(x.seat) && !isMe;
    listed.add(x.seat);
    const li = el("li", (isMe ? "is-me" : "") + (isNew ? " is-new" : ""));
    if (doodle()) li.appendChild(el("span", "medal medal--n", "✓"));
    else li.appendChild(el("span", `medal${x.place <= 3 ? ` medal--${x.place}` : ""}`, String(x.place)));
    li.appendChild(el("span", "room-face", face(player(x.seat).emoji)));
    li.appendChild(el("span", "room-name", nameOf(x.seat) + (isMe ? " (you)" : "")));
    li.appendChild(el("span", "sheet-r arc-mono is-done", doodle() ? "done" : resultText(x.result)));
    list.appendChild(li);
  }
  const removed = eligible.filter((p) => p.kickedAt != null).length;
  const still = of - done;
  $("sheetStill").hidden = !still && !removed;
  $("sheetStill").textContent = [still && `${still} still ${doodle() ? "drawing" : "playing"}`, removed && `${removed} left`].filter(Boolean).join(" · ");
  showTitleForm($("sheet"), playing && room.results[me.seat]);

  // The host can call time once half the room is done (rules.js / the API
  // hold the same line), so one wandering player does not hold everyone.
  const canEnd = me.seat === room.host && done * 2 >= of && done < of;
  $("endBtn").hidden = !canEnd;
  $("sheetFoot").textContent = canEnd
    ? `Still waiting? Call time — anyone still ${doodle() ? "drawing" : "playing"} won't finish.`
    : doodle() ? "Then the vote — when everyone's done, or at 0:00." : "Results when everyone's done, or at 0:00.";
}

$("endBtn").addEventListener("click", () => act("end", {}, $("endErr")));

/* Doodle On: the artist names their doodle. The form follows the artist from
   the waiting sheet to the vote screen, so a doodle handed in at 0:00 can
   still be named; what was typed goes with it. */
function showTitleForm(parent, show) {
  const form = $("titleForm");
  if (form.parentNode !== parent) parent.appendChild(form);
  form.hidden = !show;
}

$("titleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = await act("title", { title: $("titleInput").value }, $("titleNote"));
  if (data) $("titleNote").textContent = "Saved — secret until the reveal.";
});

// D3 · the vote ------------------------------------------------------------------

function renderVote(d, fresh) {
  show("vote");
  $("voteClock").textContent = formatDuration(Math.max(0, d.voteEnd - now()) + 999);
  if (!fresh) return;
  document.body.dataset.game = room.game;
  const { done, of } = R.voteProgress(room);
  $("voteDone").textContent = `${done} / ${of}`;
  $("voteH").textContent = R.doodleRound(room).question;
  const drew = room.results[me.seat];
  showTitleForm($("voteSlot"), drew && !pending?.error);

  // The grid is built once per set of doodles, so the pictures never reload;
  // every snapshot after that only moves the "your vote" mark.
  const tags = room.doodles || [];
  const grid = $("voteGrid");
  const { tag: own, vote } = myDoodle();
  if (gridFor !== tags.join()) {
    gridFor = tags.join();
    grid.textContent = "";
    if (!tags.length) grid.appendChild(el("li", "vote-wait", "Collecting the doodles…"));
    tags.forEach((tag, n) => {
      const li = el("li");
      const b = el("button", "vote-tile");
      b.type = "button";
      b.dataset.tag = tag;
      const img = el("img");
      img.src = doodleUrl(room, tag);
      img.alt = `Doodle ${n + 1}`;
      img.width = img.height = 256;
      b.append(img, el("span", "vote-chip arc-pix"));
      b.addEventListener("click", () => castVote(tag));
      li.appendChild(b);
      grid.appendChild(li);
    });
  }
  for (const b of grid.querySelectorAll(".vote-tile")) {
    const isOwn = b.dataset.tag === own;
    b.disabled = isOwn;
    b.classList.toggle("is-own", isOwn);
    b.classList.toggle("is-picked", b.dataset.tag === vote);
    b.setAttribute("aria-pressed", String(b.dataset.tag === vote));
    b.lastChild.textContent = isOwn ? "Yours" : b.dataset.tag === vote ? "Your vote" : "";
  }
}

async function castVote(tag) {
  const before = myDoodle().vote;
  keepDoodle({ vote: tag });
  drawnKey = "";
  render();
  if (!(await act("vote", { tag }, $("voteErr")))) {
    keepDoodle({ vote: before });
    drawnKey = "";
    render();
  }
}

const toastNote = createNote($("toast"));
function toast(text) { toastNote.show(text); }

// 07/08 · the finale: podium, table, awards, and what next ----------------------------

function renderFinal(fresh) {
  show("final");
  if (!fresh) return;
  const table = R.placements(room);
  const finishers = table.filter((x) => x.result);
  const awards = R.awards(room);

  $("podParty").textContent = `${room.name} · ${game().title}`;
  const tie = finishers.length > 1 && finishers[1].place === 1;
  $("podH").textContent = !finishers.length
    ? doodle() ? "Nobody drew anything." : "Nobody cleared it."
    : doodle() && tie ? "A dead heat — argue it out." : `${nameOf(finishers[0].seat)} takes it.`;
  $("podSub").textContent = margin(finishers);
  $("podium").hidden = doodle();
  if (doodle()) drawDoodles(finishers);
  else drawPodium($("podium"), finishers);
  $("restDoodles").hidden = $("topDoodle").hidden = !doodle() || !finishers.length;
  $("recapOpt").hidden = !doodle() || !finishers.length;
  drawTable($("resList"), table);
  drawAwards($("awards"), awards);
  $("awardsH").hidden = !awards.length;

  const isHost = me.seat === room.host;
  $("hostActions").hidden = !isHost;
  $("rematchWait").hidden = isHost;

  remember(table);
  trackOnce("party_completed", { players: table.length, game: room.game });
}

/** "Won by 1.2s", "Won by 3 moves", or a tie said out loud. */
function margin([first, second]) {
  if (!first) return doodle() ? "Blank pages all round — a rematch, maybe?" : `Nobody finished inside ${room.cap}s — a rematch, maybe?`;
  if (!second) return doodle() ? "The only doodle — it wins by default." : "The only one to finish.";
  if (doodle()) {
    if (second.place === first.place) return `${plural(first.votes, "vote")} each at the top.`;
    return `Won by ${plural(first.votes - second.votes, "vote")}.`;
  }
  if (second.place === first.place) return "A dead heat at the top.";
  const moves = second.result.moves - first.result.moves;
  if (game().by === "moves" && moves > 0) return `Won by ${moves} ${moves === 1 ? "move" : "moves"}.`;
  return `Won by ${seconds(second.result.ms - first.result.ms)}.`;
}

function drawPodium(list, finishers) {
  list.textContent = "";
  // Drawn 2 · 1 · 3, the way a podium stands.
  for (const n of [1, 0, 2]) {
    const x = finishers[n];
    if (!x) continue;
    const li = el("li", `step step--${n + 1}`);
    li.appendChild(el("span", "step-face", face(player(x.seat).emoji)));
    li.appendChild(el("span", "step-name", nameOf(x.seat)));
    li.appendChild(el("span", "step-r arc-mono", rowText(x)));
    li.appendChild(el("span", "step-block arc-pix", String(x.place)));
    list.appendChild(li);
  }
}

/* D4: the rest of the doodles come in, fewest votes first, then the top one
   big — and only after that, what its artist says it is. The timing is CSS
   (animation-delay per item), so it costs no script and no timers. */
const REVEAL_STEP_S = 0.9;
function drawDoodles(finishers) {
  const byTag = Object.fromEntries(room.tally.map((d) => [d.seat, d]));
  const [top, ...rest] = finishers;
  const list = $("restDoodles");
  list.textContent = "";
  rest.reverse().forEach((x, n) => {
    const li = el("li", "doodle");
    li.style.animationDelay = `${n * REVEAL_STEP_S}s`;
    const img = el("img");
    img.src = doodleUrl(room, byTag[x.seat].tag);
    img.alt = `${nameOf(x.seat)}'s doodle`;
    img.width = img.height = 256;
    li.append(img, el("span", "doodle-who", `${nameOf(x.seat)} · ${x.votes}`));
    if (byTag[x.seat].title) li.appendChild(el("span", "doodle-title", `“${byTag[x.seat].title}”`));
    list.appendChild(li);
  });
  const fig = $("topDoodle");
  fig.style.setProperty("--in", `${rest.length * REVEAL_STEP_S}s`);
  $("topImg").src = doodleUrl(room, byTag[top.seat].tag);
  const title = byTag[top.seat].title;
  $("topTitle").textContent = title ? `“${title}”` : "";
  $("topTitle").hidden = !title;
  $("topBy").textContent = `${title ? "says" : "Drawn by"} ${face(player(top.seat).emoji)} ${nameOf(top.seat)} · ${plural(top.votes, "vote")}`;
}

function drawTable(list, table) {
  list.textContent = "";
  for (const x of table) {
    const li = el("li", "res-row" + (x.seat === me.seat ? " is-me" : ""));
    li.appendChild(el("span", `medal medal--${x.place && x.place <= 3 ? x.place : "n"}`, x.place ? String(x.place) : "–"));
    li.appendChild(el("span", "room-face", face(player(x.seat).emoji)));
    li.appendChild(el("span", "room-name", nameOf(x.seat) + (x.seat === me.seat ? " (you)" : "")));
    li.appendChild(el("span", "res-r arc-mono", rowText(x)));
    list.appendChild(li);
  }
}

function awardDetail(a) {
  if (a.id === "photo-finish") return `beat ${nameOf(a.over)} by ${seconds(a.value)}`;
  if (a.id === "quick-hands") return `fastest hands: ${formatDuration(a.value)}`;
  if (a.id === "speed-sketcher") return `done in ${formatDuration(a.value)}, and still liked`;
  if (a.id === "buzzer-beater") return "still drawing as the clock ran out";
  return "second, and not by much";
}

function drawAwards(list, awards) {
  list.textContent = "";
  for (const a of awards) {
    const li = el("li", `award award--${a.id}`);
    li.appendChild(el("span", "award-t arc-pix", a.title));
    li.appendChild(el("span", "award-d", awardDetail(a)));
    li.appendChild(el("span", "award-who", `${face(player(a.seat).emoji)} ${nameOf(a.seat)}`));
    list.appendChild(li);
  }
}

/* The homepage's guest line: "You played at Aman's clash. You came 4th." Kept
   for guests only — a host does not need inviting to host. */
function remember(table) {
  const mine = table.find((x) => x.seat === me.seat);
  if (me.seat === 0 || !mine) return; // the creator, or someone who only watched
  setJSON(GUEST_KEY, { host: room.players[0].name, party: room.name, place: mine.place || 0, at: Date.now() });
}

/* Doodle On shares a picture: the recap card, drawn on a canvas only when
   someone taps Share. Registered ahead of the link share below, which it
   then stops. */
const recapNote = createNote($("shareNote"));
$("shareBtn").addEventListener("click", (e) => {
  if (!doodle()) return;
  e.stopImmediatePropagation();
  shareRecap();
});

async function shareRecap() {
  const blob = await recapCard();
  if (!blob) return;
  track("recap_shared");
  const file = new File([blob], "tap-clash.jpg", { type: "image/jpeg" });
  const [first] = R.placements(room);
  const who = first?.result ? `${nameOf(first.seat)} won` : "We played";
  const text = `${who} "${room.name}" — Doodle On on Tap Clash. Start your own: ${location.origin}/clash/?from=share`;
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], text }).catch(() => {});
    return;
  }
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tap-clash.jpg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  recapNote.show("Saved");
}

/** The 9:16 card: the prompt, the top doodle and its title, the ranking. */
async function recapCard() {
  const W = 720;
  const H = 1280;
  const c = el("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const font = (weight, px) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const line = (text, x, y, weight, px, color, max = W - 80) => {
    g.font = font(weight, px);
    g.fillStyle = color;
    g.fillText(text, x, y, max);
  };
  g.fillStyle = "#1b1c33";
  g.fillRect(0, 0, W, H);
  g.textAlign = "center";
  line("TAP CLASH · DOODLE ON", W / 2, 90, 800, 30, "#ff5c8a");
  line(room.name, W / 2, 150, 800, 46, "#ffffff");
  const p = R.doodleRound(room);
  line(`Turn this ${p.shape} into ${p.direction}`, W / 2, 200, 600, 28, "#b9b6d6");

  const table = R.placements(room);
  const top = table[0]?.result ? table[0] : null;
  const withDoodle = top && $("recapDoodle").checked;
  let y = 250;
  if (withDoodle) {
    const d = room.tally.find((x) => x.seat === top.seat);
    const img = $("topImg");
    await img.decode().catch(() => {});
    g.fillStyle = "#ffffff";
    g.fillRect(106, y - 4, 508, 508);
    g.drawImage(img, 110, y, 500, 500);
    y += 560;
    if (d.title) {
      line(`“${d.title}”`, W / 2, y, 700, 34, "#ffffff");
      y += 48;
    }
    line(`by ${nameOf(top.seat)} · ${plural(top.votes, "vote")}`, W / 2, y, 600, 28, "#b9b6d6");
    y += 70;
  }
  for (const r of table.slice(0, withDoodle ? 5 : 12)) {
    g.textAlign = "left";
    line(`${r.place ?? "–"}   ${face(player(r.seat).emoji)} ${nameOf(r.seat)}`, 90, y, 700, 32, r.place === 1 ? "#f0b429" : "#ffffff", 400);
    g.textAlign = "right";
    line(rowText(r), W - 90, y, 600, 28, "#b9b6d6", 160);
    y += 54;
  }
  g.textAlign = "center";
  line("tapwhenbored.com/clash", W / 2, H - 70, 800, 30, "#ffffff");
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.88));
}

/* Share the result — every player, not just the host. The link opens the
   setup page, so whoever it reaches can start one of their own. */
initShare({
  btn: $("shareBtn"),
  note: $("shareNote"),
  title: "Tap Clash",
  text: () => {
    const [first] = R.placements(room);
    const who = first?.result ? `${nameOf(first.seat)} won` : "We played";
    return `${who} "${room.name}" — ${game().title} on Tap Clash. Start your own:`;
  },
  url: () => `${location.origin}/clash/?from=share`,
});
$("shareBtn").addEventListener("click", () => track("result_shared"));

/* The next round is a rematch: same game, or the host picks another.
   While it is on its way the old room can already name the new one, and
   following it then would seat the host in their own rematch twice. */
let rematching = false;
async function rematch(choice) {
  if (rematching) return;
  rematching = true;
  const btns = [$("rematchBtn"), $("changeForm").querySelector("[type=submit]")];
  for (const b of btns) b.disabled = true;
  const data = await act("rematch", choice, $("rematchErr"));
  for (const b of btns) b.disabled = false;
  if (data?.code && data.token) {
    resetRound();
    enter(data.code, { seat: data.seat, token: data.token });
    feed.accept(data.room, data.serverNow);
  }
  rematching = false;
}

$("rematchBtn").addEventListener("click", () => rematch({}));

let changeOf = null;
$("changeBtn").addEventListener("click", () => {
  const form = $("changeForm");
  if (!changeOf) changeOf = gamePicker($("changePick"), { game: room.game, cap: room.cap });
  form.hidden = !form.hidden;
  $("changeBtn").setAttribute("aria-expanded", String(!form.hidden));
});
$("changeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  rematch(changeOf());
});

/** Everything that belonged to the last room's round. */
function resetRound() {
  drawnKey = "";
  gridFor = "";
  followAfter = 0;
  pending = null;
  $("titleInput").value = "";
  $("titleNote").textContent = "Secret until the reveal.";
  toasted.clear();
  listed.clear();
  frame?.el.remove();
  frame = null;
}

/* Everyone else follows the host into the rematch room, with the same name
   and face, without touching anything. */
let following = false;
let followAfter = 0; // no retry before this; Infinity once it cannot work
async function followRematch() {
  if (following || rematching || Date.now() < followAfter) return;
  following = true;
  const mine = mySeat();
  const res = await post({ type: "join", code: room.next, name: mine.name, emoji: mine.emoji });
  following = false;
  if (res.ok) {
    resetRound();
    enter(res.data.code, { seat: res.data.seat, token: res.data.token });
    feed.accept(res.data.room, res.data.serverNow);
  } else if (res.status === 0 || res.status === 429 || res.status >= 500) {
    followAfter = Date.now() + 2000; // lost or busy: try again, gently
  } else {
    // Started without us, full, or gone: joining again will not change that.
    followAfter = Infinity;
    gone("The next round started without you", "Joining closes when the host starts. You can start a clash of your own.");
  }
}

// 02 · setup and the code form ---------------------------------------------------------

function renderSetup() {
  const pickName = () => R.PARTY_NAMES[Math.floor(Math.random() * R.PARTY_NAMES.length)];
  $("setupParty").value = pickName();
  $("setupShuffle").addEventListener("click", () => { $("setupParty").value = pickName(); });
  $("setupName").value = getName();
  const faceOf = facePicker($("setupFaces"), savedFace());
  const setupOf = gamePicker($("setupPick"), { game: R.DEFAULT_GAME, cap: R.GAMES[R.DEFAULT_GAME].cap });

  $("setupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("setupGo").disabled = true;
    const name = $("setupName").value;
    const res = await post({ type: "create", party: $("setupParty").value, name, emoji: faceOf(), ...setupOf() });
    $("setupGo").disabled = false;
    const data = answer(res, $("setupErr"));
    if (!data) return;
    setName(name);
    const guest = getJSON(GUEST_KEY, null);
    track("party_created", setupOf());
    if (guest && Date.now() - guest.at < 14 * 24 * 3600 * 1000) track("host_from_guest");
    enter(data.code, { seat: data.seat, token: data.token });
    feed.accept(data.room, data.serverNow);
  });
  show("setup");
}

$("codeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const typed = $("codeInput").value.trim().toUpperCase();
  // Codes never use vowels, so a typo is caught here rather than by a 404.
  if (!/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(typed)) {
    $("codeErr").textContent = "That isn't a room code — check the four letters.";
    return;
  }
  enter(typed, null);
});

// ---------------------------------------------------------------------- start --

initThemeToggle($("themeBtn"));
if (params.get("from") === "share") track("share_link_opened");
if (code) enter(code, null);
else if (params.has("join")) show("code");
else renderSetup();
