// Sounds Sus, server side: the words and the laps.
//
// Only the server knows the spy and the word, so only the server can work out
// where a game is — who was voted out, and whether that ended it. `play()`
// walks the room's stored timestamps the way src/party/rules.js does for the
// other games, and returns what every phone may see: never the spy or the
// word until the game is over. Phones render it and count down to `endsAt`.
//
// One game is laps of: talk (one clue each, then discussion) → vote → out
// (host-paced) → the next lap. It ends when the spy is voted out (the room
// wins), when two players are left (the spy wins), when the host ends it, or
// when the spy leaves the room.

import * as R from "../../src/party/rules.js";

export const WORDS = [
  "Beach", "Wedding", "Airport", "Gym", "Cinema", "Hospital", "Zoo", "School", "Library", "Train station",
  "Haunted house", "Space station", "Supermarket", "Swimming pool", "Museum", "Hotel", "Restaurant", "Farm",
  "Circus", "Camping trip", "Pizza", "Biryani", "Sushi", "Ice cream", "Pani puri", "Momos", "Burger", "Chai",
  "Popcorn", "Birthday cake", "Cricket match", "Board exams", "Road trip", "Diwali", "Shaadi", "Auto-rickshaw",
  "Traffic jam", "Monsoon", "Netflix", "Selfie", "Dentist", "Pilot", "Chef", "Detective", "Influencer",
  "Firefighter", "Magician", "Teacher", "Speaker", "Fridge", "Balcony", "Playlist", "Umbrella", "Toothbrush",
  "Alarm clock", "Laptop", "Sunglasses", "Football", "Guitar", "Elevator",
];

const CARD_MS = 20000; // to peek and tap Hide & ready
const VOTE_MS = 30000;

/** mulberry32, as in rules.js: the same order from the same seed. */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lap `n`'s speaking order: shuffled, with the spy never first. */
function orderOf(seats, seed, n, spy) {
  const rand = stream(seed + n);
  const out = seats.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out[0] === spy && out.length > 1) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

/**
 * Where a Sounds Sus game is at `t`. `sus` holds the stored fields:
 * { ready: {seat: at}, lapAt: {n: at}, call: {n: at}, said: {n: {seat: at}},
 *   ballots: {n: {seat: {to, at}}} }.
 *
 * Returns { phase, lap, endsAt, alive, laps, order?, speaker?, ready?, voted?,
 * over? } — phase is card | talk | vote | out | over; `laps` are the finished
 * laps, `{ out, votes: {voter: target} }`, public once each vote closes.
 */
export function play(room, sus, spy, word, t) {
  const k = room.scale;
  const playAt = room.start + R.TITLE_MS * k;
  const seats = R.eligible(room, playAt);
  const kicked = Object.fromEntries(seats.map((p) => [p.seat, p.kickedAt]));
  const outs = new Set();
  const live = (at) => seats.map((p) => p.seat).filter((s) => !outs.has(s) && !(kicked[s] != null && kicked[s] <= at));
  const laps = [];
  const over = (by, lap) => ({ phase: "over", lap, endsAt: null, alive: live(t), laps, over: { by, spy, word: WORDS[word] } });

  // The host ending it, or the spy leaving, stops the game where it stands.
  const stops = [[room.endedAt, "host"], [kicked[spy], "left"]].filter(([at]) => at != null).sort((a, b) => a[0] - b[0]);
  const T = stops.length ? Math.min(t, stops[0][0]) : t;
  const stopped = (lap) => (stops.length && stops[0][0] <= t ? over(stops[0][1], lap) : null);

  const cardTimer = playAt + CARD_MS * k;
  const readyAt = live(playAt).map((s) => sus.ready[s]);
  const cardEnd = readyAt.every((at) => at != null) ? Math.min(cardTimer, Math.max(playAt, ...readyAt)) : cardTimer;
  if (T < cardEnd) {
    return stopped(1) || { phase: "card", lap: 1, endsAt: cardTimer, alive: live(t), laps, ready: Object.keys(sus.ready).map(Number) };
  }

  let start = cardEnd;
  for (let n = 1; ; n++) {
    const alive = live(start);
    if (alive.length <= 2) return over("spy", n);
    const order = orderOf(alive, room.seed, n, spy);
    const talkEnd = Math.min(start + room.cap * 1000 * k, sus.call[n] ?? Infinity);
    const said = sus.said[n] || {};
    if (T < talkEnd) {
      return stopped(n) || {
        phase: "talk", lap: n, endsAt: start + room.cap * 1000 * k, alive, laps, order,
        speaker: order.find((s) => said[s] == null) ?? null,
      };
    }

    const voters = live(talkEnd);
    const ballots = sus.ballots[n] || {};
    const ats = voters.map((s) => ballots[s]?.at);
    let voteEnd = talkEnd + VOTE_MS * k;
    if (ats.every((at) => at != null)) voteEnd = Math.min(voteEnd, Math.max(talkEnd, ...ats) + R.SETTLE_MS * k);
    if (T < voteEnd) {
      return stopped(n) || {
        phase: "vote", lap: n, endsAt: talkEnd + VOTE_MS * k, alive: voters, laps,
        voted: voters.filter((s) => ballots[s]),
      };
    }

    // Most votes is out; a tie at the top puts nobody out.
    const votes = {};
    const count = {};
    for (const s of live(voteEnd)) {
      const to = ballots[s]?.to;
      if (to == null || !voters.includes(to)) continue;
      votes[s] = to;
      count[to] = (count[to] || 0) + 1;
    }
    const top = Math.max(0, ...Object.values(count));
    const tops = Object.keys(count).filter((s) => count[s] === top).map(Number);
    const out = tops.length === 1 ? tops[0] : null;
    laps.push({ out, votes });
    if (out === spy) return over("room", n);
    if (out != null) outs.add(out);
    if (live(voteEnd).length <= 2) return over("spy", n);

    const next = sus.lapAt[n + 1];
    if (next == null || T < next) return stopped(n) || { phase: "out", lap: n, endsAt: null, alive: live(t), laps };
    start = next;
  }
}
