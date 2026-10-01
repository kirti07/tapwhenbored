/* Tap Party rules: one pure module, imported by the room API and by every phone.
 *
 * A party is one round of one game. There is no server clock ticking it
 * along: a room stores timestamps — when it started, when each result arrived,
 * when someone was removed, when the host ended the round — and
 * `derive(room, now)` works out where the party is from those alone. The API
 * runs it to decide whether a result is on time; each phone runs it to decide
 * which screen to show. Same code, same inputs, so they cannot disagree.
 *
 * Everything here is a pure function of a normalised room:
 *
 *   { code, name, seed, scale, game, cap, start, endedAt, next, host,
 *     players: [{ seat, name, emoji, joinedAt, kickedAt }],
 *     results: { [seat]: { ms, moves, at } },
 *     votes: { [seat]: at },                 Doodle On: who voted, and when
 *     doodles?: [tag], tally?: [{ tag, seat, votes, title }] }
 *
 * A Doodle On result has no moves: it marks that the seat drew. Who drew
 * which doodle stays on the server until the final phase, when `tally` says.
 *
 * `scale` shrinks every duration (1 in production; the tests run faster).
 * No DOM, no storage, no network here.
 */

/* The games a party can be, and the time limits a host may pick. `kind` and
 * `pitch` are what the setup screen says about each: the puzzles are a race,
 * the social games are for laughs. `min` and `max` are how many players a
 * game takes (MIN_PLAYERS / MAX_PLAYERS when absent); `ballot`, the fewest
 * entries a vote needs.
 * `party` games have no page of their own: they live only in /party/, drawn
 * by a module the party page loads when the room picks one. Presets,
 * not a free number: a limit is fair only if most of the room can finish, and
 * the server checks every result against it. Flip It is pinned to Medium —
 * Easy's 3–4-move boards clear in under two seconds and tie the room. */
export const GAMES = {
  "flip-it": {
    title: "Flip It",
    kind: "competitive",
    pitch: "Turn off every tile. Fastest clear wins.",
    by: "time",
    level: "medium",
    rule: "Turn off every tile.",
    win: "Fastest clear wins.",
    caps: [30, 60, 90],
    cap: 60,
  },
  "slide-n-order": {
    title: "Slide N Order",
    kind: "competitive",
    pitch: "Sort 1 to 15. Fewest moves wins.",
    by: "moves",
    rule: "Slide 1 to 15 back into order.",
    win: "Fewest moves wins; time breaks ties.",
    caps: [60, 90, 120, 180],
    cap: 90,
  },
  "doodle-on": {
    title: "Doodle On",
    kind: "social",
    pitch: "Draw it, then the room votes.",
    by: "votes",
    rule: "Turn the shape into the idea.",
    win: "The room votes; most votes wins.",
    caps: [30, 45, 60],
    cap: 30,
    min: 4,
    max: 12,
    ballot: 2,
    // Every phone uploads its drawing at 0:00, on one party Wi-Fi.
    grace: 6000,
  },
  "humour-me": {
    title: "Humour Me",
    kind: "social",
    pitch: "Complete the phrase. Most votes wins.",
    by: "votes",
    party: true,
    rule: "Finish the phrase.",
    win: "Most votes wins.",
    caps: [45],
    cap: 45,
    min: 4,
    max: 12,
    ballot: 3,
    vote: 30000,
  },
  "sounds-sus": {
    title: "Sounds Sus",
    kind: "social",
    pitch: "Everyone knows the word. One of you is faking it.",
    by: "spy",
    party: true,
    rule: "Everyone knows the word but the spy.",
    win: "Vote the spy out to win.",
    // The cap is each speaker's turn; the laps are paced by the server.
    caps: [45],
    cap: 45,
    min: 4,
    max: 12,
  },
};

export const DEFAULT_GAME = "flip-it";

// Milliseconds at scale 1.
export const TITLE_MS = 5000;     // title card, the last three seconds a 3-2-1
export const GRACE_MS = 3000;     // a result in flight when the clock hits 0:00
export const MIN_SOLVE_MS = 2000; // anything faster is not a solve
export const AWAY_MS = 20000;     // a host silent this long hands over (PRD)
export const VOTE_MS = 20000;     // Doodle On's vote (PRD)
export const SETTLE_MS = 3000;    // once everyone has voted, time to change a mind
export const BUZZER_MS = 2000;    // a doodle handed in this close to 0:00

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const MAX_MOVES = 10000;

/* Faces, by index: the API stores the number, never a string from a phone. */
export const FACES = ["🐼", "🐧", "🦖", "🐝", "🦉", "🦊", "🐸", "🐙", "🤖", "🐱", "🦄", "🔥"];

export const PARTY_NAMES = [
  "The Friday Standoff", "Tiny Games Summit", "The Big Tap Off", "Snack Break Showdown",
  "The Kitchen Cup", "Couch Championship", "The Lunch Hour Open", "Thumbs of Fury",
];

/** The fewest players a game starts with. */
export const minPlayers = (game) => GAMES[game].min || MIN_PLAYERS;

/** The most players a game takes: the social games seat twelve. */
export const maxPlayers = (game) => GAMES[game].max || MAX_PLAYERS;

/** A vote's length: two more seconds for each entry past eight, so twelve
 *  doodles or answers can still be read. It ends early once all have voted. */
export const voteMs = (game, entries) => (GAMES[game].vote || VOTE_MS) + Math.max(0, entries - 8) * 2000;

/** How long after 0:00 a result in flight still counts, at scale 1. */
export const graceOf = (game) => GAMES[game].grace || GRACE_MS;

/** Is this a game and a time limit a party can be played with? */
export function validSetup(game, cap) {
  return Object.hasOwn(GAMES, game) && GAMES[game].caps.includes(cap);
}

const active = (p, at) => p.kickedAt == null || p.kickedAt > at;

/** Who plays: in the room before the round started, and not removed by then. */
export function eligible(room, playAt) {
  return room.players.filter((p) => p.joinedAt < playAt && active(p, playAt));
}

/** When a player was done — solved, or removed mid-round — or null. */
function doneAt(room, p, closeAt) {
  var r = room.results[p.seat];
  if (r) return r.at;
  return p.kickedAt != null && p.kickedAt < closeAt ? p.kickedAt : null;
}

/** Doodle On and Humour Me: the seats that handed something in. A blank
 *  Doodle On page counts as done but is not on the ballot. */
export function drew(room, playAt) {
  return eligible(room, playAt).filter((p) => room.results[p.seat] && !room.results[p.seat].blank);
}

/**
 * The round's timetable, in absolute server times. It closes when the last
 * player is done, when the host ends it, or at the cap plus the grace
 * window — whichever comes first.
 *
 * Doodle On then votes, when there are two doodles to choose between: for
 * VOTE_MS, or until SETTLE_MS after the last vote once everyone has voted.
 * `voteEnd` equals `endAt` for every other round.
 */
export function timetable(room) {
  var s = room.scale;
  var playAt = room.start + TITLE_MS * s;
  var deadline = playAt + room.cap * 1000 * s;
  var closeAt = deadline + graceOf(room.game) * s;
  var endAt = playAt;
  for (var p of eligible(room, playAt)) {
    var done = doneAt(room, p, closeAt);
    if (done == null) { endAt = closeAt; break; }
    if (done > endAt) endAt = done;
  }
  if (room.endedAt != null) endAt = Math.min(endAt, room.endedAt);
  endAt = Math.min(endAt, closeAt);
  var voteEnd = endAt;
  var g = GAMES[room.game];
  var entries = drew(room, playAt).length;
  if (g.by === "votes" && entries >= g.ballot) {
    voteEnd = endAt + voteMs(room.game, entries) * s;
    var ats = voters(room, playAt).map((p) => room.votes[p.seat]);
    if (ats.every((a) => a != null)) voteEnd = Math.min(voteEnd, Math.max(endAt, ...ats) + SETTLE_MS * s);
  }
  return { titleAt: room.start, playAt: playAt, deadline: deadline, closeAt: closeAt, endAt: endAt, voteEnd: voteEnd };
}

/** Who votes: everyone in the round who is still in the room. */
function voters(room, playAt) {
  return eligible(room, playAt).filter((p) => p.kickedAt == null);
}

/**
 * Where the party is at `now`: lobby → title → play → (vote →) final.
 * Sounds Sus plays its laps inside "play"; the server works them out, since
 * only it knows the spy, and says when it is over (`room.sus.over`).
 */
export function derive(room, now) {
  if (room.start == null) return { phase: "lobby" };
  if (GAMES[room.game].by === "spy") {
    var playAt = room.start + TITLE_MS * room.scale;
    return { phase: now < playAt ? "title" : room.sus?.over ? "final" : "play", titleAt: room.start, playAt: playAt };
  }
  var t = timetable(room);
  var phase = now < t.playAt ? "title" : now < t.endAt ? "play" : now < t.voteEnd ? "vote" : "final";
  return Object.assign({ phase: phase }, t);
}

/** How many of the players in the round are done, out of how many. */
export function progress(room) {
  var t = timetable(room);
  var who = eligible(room, t.playAt);
  return { done: who.filter((p) => doneAt(room, p, t.closeAt) != null).length, of: who.length };
}

/** How many of the room have voted, out of how many. */
export function voteProgress(room) {
  var who = voters(room, timetable(room).playAt);
  return { done: who.filter((p) => room.votes[p.seat] != null).length, of: who.length };
}

/* Doodle On's party prompts: a shape from the game, a direction written for a
 * room of people, and the question the vote asks. About one round in three is
 * about someone in the room — gentle teasing, never an insult. */
const SHAPES = ["circle", "square", "triangle", "arc", "zigzag", "spiral", "cross", "dot"];
const DIRECTIONS = [
  ["something dangerous", "Which one's the most dangerous?"],
  ["something that flies", "Which one would fly best?"],
  ["something hungry", "Which one's the hungriest?"],
  ["something asleep", "Which one's the sleepiest?"],
  ["something from space", "Which one's the most alien?"],
  ["something with a face", "Which face wins?"],
  ["something in a hurry", "Which one's in the biggest hurry?"],
  ["something enormous", "Which one's the most enormous?"],
  ["something very old", "Which one's the oldest?"],
  ["something that lives in water", "Which one belongs in the sea?"],
  ["a pet you'd regret", "Which pet would you regret most?"],
  ["a terrible invention", "Which invention is the worst?"],
  ["a very confused animal", "Which animal is the most confused?"],
  ["the last thing you ate", "Which one looks tastiest?"],
  ["a monster under the bed", "Which monster is the scariest?"],
];
const ABOUT = [
  ["{name}'s dream pet", "Which pet would {name} pick?"],
  ["{name} on a Monday morning", "Which one is the most {name}?"],
  ["what {name} had for breakfast", "Which breakfast is the most {name}?"],
  ["{name} as a superhero", "Which hero is {name}?"],
  ["{name}'s secret talent", "Which talent is {name} hiding?"],
  ["{name}'s next holiday", "Where is {name} off to?"],
  ["a monster that's scared of {name}", "Which monster is the most scared?"],
  ["{name}'s new invention", "Which invention would {name} make?"],
];

/** mulberry32: the same stream from the same seed on every phone. */
function stream(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Doodle On's round, from the room's seed and who is playing:
 * `{ shape, direction, question }`. Only meaningful once the room started.
 */
export function doodleRound(room) {
  var rand = stream(room.seed);
  var pick = (list) => list[Math.floor(rand() * list.length)];
  var shape = pick(SHAPES);
  var who = eligible(room, timetable(room).playAt);
  var about = rand() < 1 / 3 && who.length > 0;
  var [direction, question] = pick(about ? ABOUT : DIRECTIONS);
  if (about) {
    var name = pick(who).name;
    // A function, so a name such as "$&" is text and not a replacement pattern.
    direction = direction.replace("{name}", () => name);
    question = question.replace("{name}", () => name);
  }
  return { shape: shape, direction: direction, question: question };
}

/* Times compare at a tenth of a second: closer than that is a tie, and ties
 * share the higher place. Slide N Order ranks moves first, time second;
 * Doodle On ranks on votes alone. */
const tenths = (ms) => Math.round(ms / 100);
function keyOf(by, r, votes) {
  if (by === "votes") return [-votes];
  return by === "moves" ? [r.moves, tenths(r.ms)] : [tenths(r.ms)];
}
function compareKeys(a, b) {
  for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

/**
 * The round's table: every eligible player, finishers first in order, each
 * with a place (null for didn't finish). Doodle On rows carry `votes`, which
 * are known only once the final snapshot brings the tally.
 */
export function placements(room) {
  var by = GAMES[room.game].by;
  var votes = {};
  for (var d of room.tally || []) votes[d.seat] = d.votes;
  var rows = eligible(room, timetable(room).playAt).map((p) => {
    var r = room.results[p.seat];
    if (r?.blank) r = null; // done, but nothing to rank
    var v = votes[p.seat] || 0;
    return { seat: p.seat, result: r || null, key: r ? keyOf(by, r, v) : null, place: null, votes: v };
  });
  var done = rows.filter((x) => x.result).sort((a, b) => compareKeys(a.key, b.key) || a.seat - b.seat);
  done.forEach((x, n) => {
    x.place = n > 0 && compareKeys(x.key, done[n - 1].key) === 0 ? done[n - 1].place : n + 1;
  });
  return done.concat(rows.filter((x) => !x.result).sort((a, b) => a.seat - b.seat));
}

/**
 * Awards for one round. Each goes to the best candidate who did not win and
 * has no award yet, where one exists — so more of the room leaves with
 * something — and otherwise to the best candidate at all.
 *
 * Returns [{ id, title, seat, value, over? }]: `value` is the margin or time
 * that earned it; `over` is who a Photo Finish was won against.
 */
export function awards(room) {
  var by = GAMES[room.game].by;
  var done = placements(room).filter((x) => x.result);
  var winner = done.length ? done[0].seat : null;
  var given = new Set();
  var out = [];

  function give(id, title, candidates) {
    if (!candidates.length) return;
    var pick =
      candidates.find((c) => c.seat !== winner && !given.has(c.seat)) ||
      candidates.find((c) => c.seat !== winner) ||
      candidates[0];
    given.add(pick.seat);
    out.push(Object.assign({ id: id, title: title }, pick));
  }

  if (by === "votes") {
    if (room.game !== "doodle-on") return out;
    var second = done.filter((x) => x.place === 2);
    give("almost-had-it", "Almost Had It", second.map((x) => ({ seat: x.seat, value: x.votes })));
    // Speed Sketcher: the quickest Done that the room still liked.
    var liked = done.filter((x) => x.votes > 0).sort((x, y) => x.result.ms - y.result.ms);
    give("speed-sketcher", "Speed Sketcher", liked.map((x) => ({ seat: x.seat, value: x.result.ms })));
    // Buzzer Beater: still drawing as the clock ran out.
    var last = room.cap * 1000 * room.scale - BUZZER_MS * room.scale;
    var late = done.filter((x) => x.result.ms >= last).sort((x, y) => y.result.ms - x.result.ms);
    give("buzzer-beater", "Buzzer Beater", late.map((x) => ({ seat: x.seat, value: x.result.ms })));
    return out;
  }

  // Photo Finish: the smallest time gap between neighbours who did not tie
  // (for Slide N Order, only between players on the same move count).
  var gaps = [];
  for (var n = 1; n < done.length; n++) {
    var a = done[n - 1];
    var b = done[n];
    if (compareKeys(a.key, b.key) === 0) continue;
    if (by === "moves" && a.result.moves !== b.result.moves) continue;
    gaps.push({ seat: a.seat, value: b.result.ms - a.result.ms, over: b.seat });
  }
  give("photo-finish", "Photo Finish", gaps.sort((x, y) => x.value - y.value));

  var runnerUp = done.filter((x) => x.place === 2);
  give("almost-had-it", "Almost Had It", runnerUp.map((x) => ({ seat: x.seat, value: x.result.ms })));

  // Slide N Order ranks on moves, so the quickest hands can go unrewarded.
  if (by === "moves") {
    var quick = done.slice().sort((x, y) => x.result.ms - y.result.ms);
    give("quick-hands", "Quick Hands", quick.map((x) => ({ seat: x.seat, value: x.result.ms })));
  }
  return out;
}
