/* Tap Clash rules: one pure module, imported by the room API and by every phone.
 *
 * A clash is one round of one game. There is no server clock ticking it
 * along: a room stores timestamps — when it started, when each result arrived,
 * when someone was removed, when the host ended the round — and
 * `derive(room, now)` works out where the clash is from those alone. The API
 * runs it to decide whether a result is on time; each phone runs it to decide
 * which screen to show. Same code, same inputs, so they cannot disagree.
 *
 * Everything here is a pure function of a normalised room:
 *
 *   { code, name, seed, scale, game, cap, start, endedAt, next, host,
 *     players: [{ seat, name, emoji, joinedAt, kickedAt }],
 *     results: { [seat]: { ms, moves, at } } }
 *
 * `scale` shrinks every duration (1 in production; the tests run faster).
 * No DOM, no storage, no network here.
 */

/* The games a clash can be, and the time limits a host may pick. Presets,
 * not a free number: a limit is fair only if most of the room can finish, and
 * the server checks every result against it. Flip It is pinned to Medium —
 * Easy's 3–4-move boards clear in under two seconds and tie the room. */
export const GAMES = {
  "flip-it": {
    title: "Flip It",
    by: "time",
    level: "medium",
    rule: "Turn off every tile.",
    win: "Fastest clear wins.",
    caps: [30, 60, 90],
    cap: 60,
  },
  "slide-n-order": {
    title: "Slide N Order",
    by: "moves",
    rule: "Slide 1 to 15 back into order.",
    win: "Fewest moves wins; time breaks ties.",
    caps: [60, 90, 120, 180],
    cap: 90,
  },
};

export const DEFAULT_GAME = "flip-it";

// Milliseconds at scale 1.
export const TITLE_MS = 5000;     // title card, the last three seconds a 3-2-1
export const GRACE_MS = 3000;     // a result in flight when the clock hits 0:00
export const MIN_SOLVE_MS = 2000; // anything faster is not a solve
export const AWAY_MS = 20000;     // a host silent this long hands over (PRD)

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const MAX_MOVES = 10000;

/* Faces, by index: the API stores the number, never a string from a phone. */
export const FACES = ["🐼", "🐧", "🦖", "🐝", "🦉", "🦊", "🐸", "🐙", "🤖", "🐱", "🦄", "🔥"];

export const PARTY_NAMES = [
  "The Friday Standoff", "Tiny Games Summit", "The Big Tap Off", "Snack Break Showdown",
  "The Kitchen Cup", "Couch Championship", "The Lunch Hour Open", "Thumbs of Fury",
];

/** Is this a game and a time limit a clash can be played with? */
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

/**
 * The round's timetable, in absolute server times. It closes when the last
 * player is done, when the host ends it, or at the cap plus the grace
 * window — whichever comes first.
 */
export function timetable(room) {
  var s = room.scale;
  var playAt = room.start + TITLE_MS * s;
  var deadline = playAt + room.cap * 1000 * s;
  var closeAt = deadline + GRACE_MS * s;
  var endAt = playAt;
  for (var p of eligible(room, playAt)) {
    var done = doneAt(room, p, closeAt);
    if (done == null) { endAt = closeAt; break; }
    if (done > endAt) endAt = done;
  }
  if (room.endedAt != null) endAt = Math.min(endAt, room.endedAt);
  return { titleAt: room.start, playAt: playAt, deadline: deadline, closeAt: closeAt, endAt: Math.min(endAt, closeAt) };
}

/** Where the clash is at `now`: lobby → title → play → final. */
export function derive(room, now) {
  if (room.start == null) return { phase: "lobby" };
  var t = timetable(room);
  var phase = now < t.playAt ? "title" : now < t.endAt ? "play" : "final";
  return Object.assign({ phase: phase }, t);
}

/** How many of the players in the round are done, out of how many. */
export function progress(room) {
  var t = timetable(room);
  var who = eligible(room, t.playAt);
  return { done: who.filter((p) => doneAt(room, p, t.closeAt) != null).length, of: who.length };
}

/* Times compare at a tenth of a second: closer than that is a tie, and ties
 * share the higher place. Slide N Order ranks moves first, time second. */
const tenths = (ms) => Math.round(ms / 100);
const keyOf = (by, r) => (by === "moves" ? [r.moves, tenths(r.ms)] : [tenths(r.ms)]);
function compareKeys(a, b) {
  for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

/**
 * The round's table: every eligible player, finishers first in order, each
 * with a place (null for didn't finish).
 */
export function placements(room) {
  var by = GAMES[room.game].by;
  var rows = eligible(room, timetable(room).playAt).map((p) => {
    var r = room.results[p.seat];
    return { seat: p.seat, result: r || null, key: r ? keyOf(by, r) : null, place: null };
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

  var second = done.filter((x) => x.place === 2);
  give("almost-had-it", "Almost Had It", second.map((x) => ({ seat: x.seat, value: x.result.ms })));

  // Slide N Order ranks on moves, so the quickest hands can go unrewarded.
  if (by === "moves") {
    var quick = done.slice().sort((x, y) => x.result.ms - y.result.ms);
    give("quick-hands", "Quick Hands", quick.map((x) => ({ seat: x.seat, value: x.result.ms })));
  }
  return out;
}
