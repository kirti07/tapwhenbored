// The Tap Clash room API, exercised directly: the real handler
// (api/_lib/clash.js) over the in-memory store, with a clock the test owns.
// No browser — these are the server's rules, including every rejection, and
// the rate limits the dev server switches off.

import { test, expect } from "@playwright/test";
import { createHandler } from "../../api/_lib/clash.js";
import { createMemoryStore } from "../../scripts/clash-dev-store.js";
import * as R from "../../src/clash/rules.js";

const ORIGIN = "https://clash.test";
const URL_ = `${ORIGIN}/api/clash/`;

function setup({ limits = null } = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const store = createMemoryStore(clock.now);
  const handle = createHandler({ store, now: clock.now, limits });

  async function post(body, { origin = ORIGIN, raw } = {}) {
    const res = await handle(
      new Request(URL_, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin, "x-real-ip": "203.0.113.9" },
        body: raw ?? JSON.stringify(body),
      }),
    );
    return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
  }
  async function get(code) {
    const res = await handle(new Request(`${URL_}?r=${code}`));
    return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
  }
  return { clock, store, handle, post, get };
}

/** A room with a host and `guests` more players. Seats are 0..guests. */
async function party(api, guests = 2, choice = {}) {
  const made = await api.post({ type: "create", party: "Test Night", name: "Aman", emoji: 0, ...choice });
  const seats = [{ seat: 0, token: made.body.token }];
  for (let i = 1; i <= guests; i++) {
    api.clock.advance(10);
    const j = await api.post({ type: "join", code: made.body.code, name: `P${i}`, emoji: i });
    seats.push({ seat: j.body.seat, token: j.body.token });
  }
  const code = made.body.code;
  const as = (n, body) => api.post({ code, seat: seats[n].seat, token: seats[n].token, ...body });
  return { code, seats, as, room: async () => (await api.get(code)).body.room };
}

/** Start the room and move the clock to just after the board goes live. */
async function toPlay(api, p) {
  await p.as(0, { type: "start" });
  const room = await p.room();
  api.clock.advance(R.timetable(room).playAt - api.clock.now() + 1);
  return room;
}

test.describe("creating and reading a room", () => {
  test("create answers with a code, seat 0, a token, and the default game", async () => {
    const api = setup();
    const res = await api.post({ type: "create", party: "Test Night", name: "Aman", emoji: 3 });
    expect(res.status).toBe(200);
    expect(res.cache).toBe("no-store");
    expect(res.body.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(res.body.seat).toBe(0);
    expect(res.body.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.room).toMatchObject({ game: "flip-it", cap: 60, start: null, endedAt: null });
    expect(res.body.room.players).toEqual([
      { seat: 0, name: "Aman", emoji: 3, joinedAt: 1_000_000, kickedAt: null },
    ]);
  });

  test("the host picks the game and the time limit, from the presets only", async () => {
    const api = setup();
    const slide = await api.post({ type: "create", name: "a", emoji: 0, game: "slide-n-order", cap: 180 });
    expect(slide.body.room).toMatchObject({ game: "slide-n-order", cap: 180 });
    const own = await api.post({ type: "create", name: "a", emoji: 0, game: "slide-n-order" });
    expect(own.body.room.cap).toBe(90); // that game's default
    for (const bad of [
      { game: "flip-it", cap: 120 },
      { game: "flip-it", cap: "60" },
      { game: "chess" },
      { game: "__proto__", cap: 60 },
    ]) {
      expect((await api.post({ type: "create", name: "a", emoji: 0, ...bad })).status, JSON.stringify(bad)).toBe(400);
    }
  });

  test("a snapshot is an allowlist: no token hashes, no pings", async () => {
    const api = setup();
    const p = await party(api, 2);
    const res = await api.get(p.code);
    expect(res.status).toBe(200);
    expect(res.cache).toBe("public, s-maxage=1");
    expect(Object.keys(res.body.room).sort()).toEqual(
      ["cap", "code", "endedAt", "game", "host", "name", "next", "players", "results", "scale", "seed", "start"],
    );
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/"t:|"s:|token/);
    expect(text).not.toContain(p.seats[0].token);
  });

  test("an unknown room is a cached 404; a malformed code is an uncached 400", async () => {
    const api = setup();
    expect(await api.get("BCDF")).toMatchObject({ status: 404, cache: "public, s-maxage=1" });
    expect(await api.get("abcd")).toMatchObject({ status: 400, cache: "no-store" });
    expect(await api.get("AEIO")).toMatchObject({ status: 400 });
  });

  test("names are cleaned and capped, faces are indices", async () => {
    const api = setup();
    const long = await api.post({ type: "create", name: "  a   very long name that goes on and on ", emoji: 0 });
    expect(long.body.room.players[0].name).toBe("a very long name that go");
    expect((await api.post({ type: "create", name: "   ", emoji: 0 })).status).toBe(400);
    expect((await api.post({ type: "create", name: "x", emoji: 99 })).status).toBe(400);
    expect((await api.post({ type: "create", name: "x", emoji: "🐼" })).status).toBe(400);
  });
});

test.describe("what the API refuses", () => {
  test("another origin, oversize bodies, bad JSON, unknown actions", async () => {
    const api = setup();
    const ok = { type: "create", name: "x", emoji: 0 };
    expect((await api.post(ok, { origin: "https://evil.test" })).status).toBe(403);
    expect((await api.post(ok, { origin: null })).status).toBe(403);
    expect((await api.post(null, { raw: "{" })).status).toBe(400);
    expect((await api.post(null, { raw: JSON.stringify({ ...ok, pad: "x".repeat(5000) }) })).status).toBe(413);
    expect((await api.post({ type: "drop-table" })).status).toBe(400);
  });

  test("a wrong token, a missing seat, and a room code that is not a room", async () => {
    const api = setup();
    const p = await party(api, 2);
    expect((await api.post({ type: "ping", code: p.code, seat: 1, token: "nope" })).status).toBe(403);
    expect((await api.post({ type: "ping", code: p.code, seat: 7, token: p.seats[1].token })).status).toBe(403);
    expect((await api.post({ type: "ping", code: p.code, seat: 0, token: p.seats[1].token })).status).toBe(403);
    expect((await api.post({ type: "join", code: "BCDF", name: "x", emoji: 0 })).status).toBe(404);
  });

  test("only the host starts, and only with two players", async () => {
    const api = setup();
    const alone = await party(api, 0);
    expect((await alone.as(0, { type: "start" })).status).toBe(409);

    const p = await party(api, 1); // the host and one guest: enough
    expect((await p.as(1, { type: "start" })).status).toBe(403);
    const started = await p.as(0, { type: "start" });
    expect(started.status).toBe(200);
    expect(started.body.room.start).toBe(api.clock.now());
    // Starting twice is a no-op, not a restart.
    api.clock.advance(1000);
    expect((await p.as(0, { type: "start" })).body.room.start).toBe(started.body.room.start);
  });

  test("a room holds ten", async () => {
    const api = setup();
    const p = await party(api, 9);
    expect(p.seats.map((s) => s.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect((await api.post({ type: "join", code: p.code, name: "11th", emoji: 0 })).status).toBe(409);
  });

  test("rate limits: posts per minute, and rooms per ten minutes", async () => {
    const api = setup({ limits: { post: 3, create: 1 } });
    expect((await api.post({ type: "create", name: "a", emoji: 0 })).status).toBe(200);
    expect((await api.post({ type: "create", name: "a", emoji: 0 })).status).toBe(429);
    api.clock.advance(60_000);
    const room = (await api.post({ type: "join", code: "BCDF", name: "a", emoji: 0 })).status;
    expect(room).toBe(404); // counted, but under the per-minute limit
  });

  test("a store that is down is a 503, never an empty room", async () => {
    const handle = createHandler({ store: { pipeline: async () => { throw new Error("down"); } }, limits: null });
    const res = await handle(new Request(`${URL_}?r=BCDF`));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

test.describe("results", () => {
  test("a result is taken only while the round is live, on its board, at a plausible time", async () => {
    const api = setup();
    const p = await party(api, 2, { game: "flip-it", cap: 30 });
    await p.as(0, { type: "start" });
    const room = await p.room();
    const good = { type: "result", seed: room.seed, ms: 9000, moves: 9 };

    // Title card: not live yet.
    expect((await p.as(1, good)).status).toBe(409);

    api.clock.advance(R.timetable(room).playAt - api.clock.now() + 1);
    api.clock.advance(12_000);
    expect((await p.as(1, { ...good, seed: room.seed + 1 })).status).toBe(400); // wrong board
    expect((await p.as(1, { ...good, ms: 1500 })).status).toBe(400); // faster than a solve
    expect((await p.as(1, { ...good, ms: 16_000 })).status).toBe(400); // longer than has passed + grace
    expect((await p.as(1, { ...good, ms: 9000.5 })).status).toBe(400);
    expect((await p.as(1, { ...good, moves: 0 })).status).toBe(400);

    const ok = await p.as(1, good);
    expect(ok.status).toBe(200);
    expect(ok.body.room.results[1]).toEqual({ ms: 9000, moves: 9, at: api.clock.now() });

    // A second result changes nothing.
    const again = await p.as(1, { ...good, ms: 8000 });
    expect(again.body.room.results[1].ms).toBe(9000);

    // The room's own 30 s limit caps the claimed time (27 s in, still live).
    api.clock.advance(15_000);
    expect((await p.as(2, { ...good, ms: 31_000 })).status).toBe(400);
  });

  test("the round closes once every player is done", async () => {
    const api = setup();
    const p = await party(api, 2);
    const room = await toPlay(api, p);
    api.clock.advance(5000);
    for (const n of [0, 1, 2]) await p.as(n, { type: "result", seed: room.seed, ms: 4000 + n, moves: 9 });
    expect(R.derive(await p.room(), api.clock.now()).phase).toBe("final");
  });

  test("someone who joins after the start cannot post a result", async () => {
    const api = setup();
    const p = await party(api, 1);
    const room = await toPlay(api, p);
    const late = await api.post({ type: "join", code: p.code, name: "Late", emoji: 5 });
    api.clock.advance(4000);
    const res = await api.post({ code: p.code, seat: late.body.seat, token: late.body.token, type: "result", seed: room.seed, ms: 3000, moves: 9 });
    expect(res.status).toBe(403);
  });
});

test.describe("the host", () => {
  test("ends the round once half the room is done — and not before", async () => {
    const api = setup();
    const p = await party(api, 3);
    expect((await p.as(0, { type: "end" })).status).toBe(409); // not started
    const room = await toPlay(api, p);
    api.clock.advance(5000);
    await p.as(1, { type: "result", seed: room.seed, ms: 4000, moves: 9 });
    expect((await p.as(0, { type: "end" })).status).toBe(409); // 1 of 4
    await p.as(2, { type: "result", seed: room.seed, ms: 4500, moves: 9 });
    expect((await p.as(1, { type: "end" })).status).toBe(403); // not the host

    const ended = await p.as(0, { type: "end" }); // 2 of 4
    expect(ended.status).toBe(200);
    expect(ended.body.room.endedAt).toBe(api.clock.now());
    expect(R.derive(ended.body.room, api.clock.now()).phase).toBe("final");
    expect((await p.as(3, { type: "result", seed: room.seed, ms: 5000, moves: 9 })).status).toBe(409);
  });

  test("removes players; a removed seat can do nothing; the host cannot be removed", async () => {
    const api = setup();
    const p = await party(api, 3);
    expect((await p.as(1, { type: "kick", target: 2 })).status).toBe(403);
    expect((await p.as(0, { type: "kick", target: 0 })).status).toBe(400);
    const res = await p.as(0, { type: "kick", target: 2 });
    expect(res.body.room.players[2].kickedAt).toBe(api.clock.now());
    expect((await p.as(2, { type: "ping" })).status).toBe(403);
  });

  test("hands over after 20 s of silence, to the earliest-joined live player, for good", async () => {
    const api = setup();
    const p = await party(api, 2);
    api.clock.advance(15_000);
    await p.as(2, { type: "ping" });
    await p.as(1, { type: "ping" });
    api.clock.advance(10_000); // host silent for 25 s; seats 1 and 2 pinged 10 s ago

    // Seat 2 is live but seat 1 joined first, so seat 2's ping moves nothing.
    expect((await p.as(2, { type: "ping" })).body.room.host).toBe(0);
    expect((await p.as(1, { type: "ping" })).body.room.host).toBe(1);

    // The old host is back — as a player.
    expect((await p.as(0, { type: "ping" })).body.room.host).toBe(1);
    expect((await p.as(0, { type: "start" })).status).toBe(403);
    expect((await p.as(1, { type: "start" })).status).toBe(200);
  });

  test("a host who keeps pinging keeps the room", async () => {
    const api = setup();
    const p = await party(api, 2);
    for (let i = 0; i < 4; i++) {
      api.clock.advance(10_000);
      await p.as(0, { type: "ping" });
      expect((await p.as(1, { type: "ping" })).body.room.host).toBe(0);
    }
  });

  test("rematch: once the round is over, same game by default or a new one", async () => {
    const api = setup();
    const p = await party(api, 2, { game: "flip-it", cap: 30 });
    await p.as(0, { type: "start" });
    expect((await p.as(0, { type: "rematch" })).status).toBe(409);

    api.clock.advance(60_000); // the round times out
    expect((await p.as(1, { type: "rematch" })).status).toBe(403);
    expect((await p.as(0, { type: "rematch", game: "flip-it", cap: 45 })).status).toBe(400);

    const same = await p.as(0, { type: "rematch" });
    expect(same.status).toBe(200);
    expect(same.body.code).not.toBe(p.code);
    expect(same.body.room).toMatchObject({ name: "Test Night", game: "flip-it", cap: 30 });
    expect(same.body.room.players[0].name).toBe("Aman");
    expect((await p.room()).next).toBe(same.body.code);
    // A double tap follows the room that already exists.
    expect((await p.as(0, { type: "rematch" })).body.room.next).toBe(same.body.code);

    const q = await party(api, 1);
    await q.as(0, { type: "start" });
    api.clock.advance(120_000);
    const changed = await q.as(0, { type: "rematch", game: "slide-n-order", cap: 120 });
    expect(changed.body.room).toMatchObject({ game: "slide-n-order", cap: 120 });
  });
});
