// Tap Clash's rules (src/clash/rules.js): pure functions of a room, so these
// build rooms by hand and assert what a phone would show.

import { test, expect } from "@playwright/test";
import * as R from "../../src/clash/rules.js";

/** A started room at scale 1: `n` players who joined before the start. */
function room(n = 4, game = "flip-it", cap = 60) {
  return {
    code: "BCDF",
    name: "Test",
    seed: 42,
    scale: 1,
    game,
    cap,
    start: 100_000,
    endedAt: null,
    next: null,
    host: 0,
    players: Array.from({ length: n }, (_, seat) => ({
      seat, name: `P${seat}`, emoji: seat, joinedAt: 1000 + seat, kickedAt: null,
    })),
    results: {},
  };
}

const at = (r, dt) => R.timetable(r).playAt + dt;
const put = (r, seat, ms, moves = 9) => {
  r.results[seat] = { ms, moves, at: at(r, ms + 50) };
};

test("a clash walks lobby → title → play → final, once", () => {
  const r = room();
  expect(R.derive({ ...r, start: null }, 0).phase).toBe("lobby");
  const t = R.timetable(r);
  expect(t.playAt - t.titleAt).toBe(R.TITLE_MS);
  expect(R.derive(r, t.titleAt).phase).toBe("title");
  expect(R.derive(r, t.playAt).phase).toBe("play");
  // Nobody finishes: the round runs to the room's cap plus the grace window.
  expect(t.endAt).toBe(t.playAt + 60_000 + R.GRACE_MS);
  expect(R.derive(r, t.endAt).phase).toBe("final");
});

test("the time limit is the room's own", () => {
  const r = room(2, "slide-n-order", 180);
  const t = R.timetable(r);
  expect(t.deadline - t.playAt).toBe(180_000);
});

test("the round ends when the last player is done, not at the cap", () => {
  const r = room(3);
  put(r, 0, 5000);
  put(r, 1, 7000);
  expect(R.derive(r, at(r, 20_000)).phase).toBe("play");
  expect(R.progress(r)).toEqual({ done: 2, of: 3 });
  put(r, 2, 9000);
  expect(R.timetable(r).endAt).toBe(at(r, 9050));
});

test("the host can end it early; whoever is still playing did not finish", () => {
  const r = room(3);
  put(r, 0, 5000);
  put(r, 1, 7000);
  r.endedAt = at(r, 12_000);
  expect(R.derive(r, at(r, 12_000)).phase).toBe("final");
  expect(R.placements(r).find((x) => x.seat === 2)).toMatchObject({ place: null, result: null });
});

test("a removed player counts as done at the moment of removal", () => {
  const r = room(3);
  put(r, 0, 5000);
  put(r, 1, 6000);
  r.players[2].kickedAt = at(r, 8000);
  expect(R.timetable(r).endAt).toBe(at(r, 8000));
});

test("Flip It ranks on time; ties at a tenth of a second share the place", () => {
  const r = room(4);
  put(r, 0, 5000);
  put(r, 1, 5040);
  put(r, 2, 5200);
  expect(R.placements(r).map((x) => [x.seat, x.place])).toEqual([[0, 1], [1, 1], [2, 3], [3, null]]);
});

test("Slide N Order ranks on moves first, time second", () => {
  const r = room(3, "slide-n-order", 90);
  put(r, 0, 30_000, 44);
  put(r, 1, 50_000, 38);
  put(r, 2, 20_000, 44);
  expect(R.placements(r).map((x) => x.seat)).toEqual([1, 2, 0]);
});

// Joining closes at the start (api.spec.js); this is a join that raced it.
test("someone whose join lands after the board went live only watches", () => {
  const r = room(3);
  r.players.push({ seat: 3, name: "Late", emoji: 0, joinedAt: at(r, 1000), kickedAt: null });
  expect(R.placements(r).map((x) => x.seat)).not.toContain(3);
  expect(R.progress(r).of).toBe(3);
});

test("awards go to someone who did not win, wherever possible", () => {
  const r = room(4, "slide-n-order", 90);
  put(r, 0, 40_000, 30); // wins on moves
  put(r, 1, 20_000, 34); // quickest hands, 2nd
  put(r, 2, 30_000, 40);
  put(r, 3, 30_300, 40); // photo finish behind seat 2
  const byId = Object.fromEntries(R.awards(r).map((a) => [a.id, a]));
  expect(byId["photo-finish"]).toMatchObject({ seat: 2, value: 300, over: 3 });
  expect(byId["almost-had-it"].seat).toBe(1);
  // Seats 1 and 2 already hold one, so the next-quickest without one gets it.
  expect(byId["quick-hands"].seat).toBe(3);
  expect(Object.values(byId).some((a) => a.seat === 0)).toBe(false);
});

test("Flip It has no Quick Hands, and an empty round has no awards", () => {
  const r = room(3);
  expect(R.awards(r)).toEqual([]);
  put(r, 0, 5000);
  put(r, 1, 6000);
  expect(R.awards(r).map((a) => a.id)).toEqual(["photo-finish", "almost-had-it"]);
});

test("only the listed games and time limits are playable", () => {
  expect(R.validSetup("flip-it", 60)).toBe(true);
  expect(R.validSetup("slide-n-order", 180)).toBe(true);
  expect(R.validSetup("flip-it", 120)).toBe(false);
  expect(R.validSetup("flip-it", "60")).toBe(false);
  expect(R.validSetup("chess", 60)).toBe(false);
  expect(R.validSetup("toString", 60)).toBe(false);
  for (const g of Object.values(R.GAMES)) expect(g.caps).toContain(g.cap);
});
