// The Tap Clash room API, as one request handler.
//
//   GET  /api/clash/?r=CODE   the room's snapshot (CDN-cached for 1 s)
//   POST /api/clash/          { type, ... } → a fresh, uncached snapshot
//        create | join | ping | start | result | end | kick | rematch
//
// `createHandler({ store, now, scale, limits })` returns `(Request) => Response`.
// The store is anything with `pipeline(commands)` — Upstash in production
// (api/_lib/redis.js), an in-memory one in dev and tests
// (scripts/clash-dev-store.js) — so this file is the whole server and runs
// the same everywhere.
//
// A room is one Redis hash, `clash:{code}`, that expires 3 h after it was
// created. Its fields, and the one command that ever writes each:
//
//   seed        HSETNX   the room's seed, which is the board's seed
//   name scale  HSET     clash name; duration scale (1 in production)
//   g cap       HSET     the game and its time limit, fixed at creation
//   seats       HINCRBY  seat counter; the creator is seat 0
//   h           HSET     the host's seat (moves if the host goes quiet)
//   start       HSETNX   when the host started the round
//   ended       HSETNX   when the host ended the round early
//   next        HSETNX   the rematch room's code
//   p:{seat}    HSET     { name, emoji, joinedAt }
//   t:{seat}    HSET     SHA-256 of the seat's token — never leaves the server
//   s:{seat}    HSET     last ping — never leaves the server
//   x:{seat}    HSETNX   when the seat was removed
//   r:{seat}    HSETNX   { ms, moves, at }
//
// Nothing is ever deleted and every write is one atomic command, so two
// phones racing can only ever both succeed or have the second one no-op.
// Where the clash *is* is never stored: src/clash/rules.js derives it.

import * as R from "../../src/clash/rules.js";

const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"; // no vowels: no words, no O/0 or I/1
const CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
const TTL_S = 3 * 60 * 60;
const MAX_BODY = 4096;
const MAX_NAME = 24;
const MAX_PARTY_NAME = 40;
const TYPES = ["create", "join", "ping", "start", "result", "end", "kick", "rematch"];
const HOST_ONLY = ["start", "end", "kick", "rematch"];

const roomKey = (code) => `clash:${code}`;

class Reject extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const reject = (status, message) => { throw new Reject(status, message); };

function json(body, status, cache) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });
}

/** Trim, collapse whitespace, cap — the same rule as `clean()` in player.js. */
function clean(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** The caller's rate-limit bucket: its IP, with IPv6 cut to the /64. */
function clientKey(request) {
  const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "local")
    .split(",")[0]
    .trim();
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
}

/**
 * A room hash as `{ room, tokens, pings }`. `room` is built field by field —
 * an allowlist — so a token hash or a ping time cannot reach a snapshot by
 * accident. It is exactly the shape src/clash/rules.js works on.
 */
export function parseRoom(code, flat) {
  if (!flat || !flat.length) return null;
  const f = {};
  for (let i = 0; i < flat.length; i += 2) f[flat[i]] = flat[i + 1];
  if (f.seed === undefined) return null;

  const room = {
    code,
    name: f.name || "",
    seed: Number(f.seed),
    scale: Number(f.scale) || 1,
    game: f.g,
    cap: Number(f.cap),
    start: f.start ? Number(f.start) : null,
    endedAt: f.ended ? Number(f.ended) : null,
    next: f.next || null,
    host: Number(f.h || 0),
    players: [],
    results: {},
  };
  const tokens = {};
  const pings = {};
  for (const [k, v] of Object.entries(f)) {
    const m = /^(p|t|s|r):(\d+)$/.exec(k);
    if (!m) continue;
    const seat = Number(m[2]);
    if (m[1] === "p") {
      const p = JSON.parse(v);
      room.players.push({
        seat,
        name: p.name,
        emoji: p.emoji,
        joinedAt: p.joinedAt,
        kickedAt: f[`x:${seat}`] ? Number(f[`x:${seat}`]) : null,
      });
    } else if (m[1] === "t") tokens[seat] = v;
    else if (m[1] === "s") pings[seat] = Number(v);
    else room.results[seat] = JSON.parse(v);
  }
  room.players.sort((a, b) => a.seat - b.seat);
  return { room, tokens, pings };
}

/**
 * Who takes over from a host that has gone quiet: the earliest-joined seat
 * still in the room that has pinged within the away window.
 */
export function nextHost(room, pings, now) {
  const away = R.AWAY_MS * room.scale;
  const live = room.players.filter(
    (p) => p.seat !== room.host && p.kickedAt == null && now - (pings[p.seat] || 0) <= away,
  );
  live.sort((a, b) => a.joinedAt - b.joinedAt || a.seat - b.seat);
  return live.length ? live[0].seat : null;
}

export function createHandler({ store, now = Date.now, scale = 1, limits = { post: 60, create: 10 } }) {
  async function read(code) {
    const [flat] = await store.pipeline([["HGETALL", roomKey(code)]]);
    return parseRoom(code, flat);
  }

  /** Run writes, then read the room back in the same round trip. */
  async function write(code, commands) {
    const key = roomKey(code);
    // EXPIRE NX sets the TTL only if the hash has none, so a write that lands
    // just as a room expires cannot leave behind a hash that lives forever.
    const out = await store.pipeline([...commands, ["EXPIRE", key, TTL_S, "NX"], ["HGETALL", key]]);
    return { out, room: parseRoom(code, out[out.length - 1]).room };
  }

  async function rateLimit(request, type) {
    if (!limits) return;
    const ip = clientKey(request);
    const t = now();
    const minute = `rl:${ip}:${Math.floor(t / 60000)}`;
    const commands = [["INCR", minute], ["EXPIRE", minute, 120]];
    const tenMin = `rlc:${ip}:${Math.floor(t / 600000)}`;
    if (type === "create" || type === "rematch") commands.push(["INCR", tenMin], ["EXPIRE", tenMin, 1200]);
    const out = await store.pipeline(commands);
    if (out[0] > limits.post || (out[2] !== undefined && out[2] > limits.create)) {
      reject(429, "slow down");
    }
  }

  function player(body) {
    const name = clean(body.name, MAX_NAME);
    const emoji = body.emoji;
    if (!name) reject(400, "name required");
    if (!Number.isInteger(emoji) || emoji < 0 || emoji >= R.FACES.length) reject(400, "bad face");
    return { name, emoji };
  }

  /** The game and time limit a create or rematch asks for, checked. */
  function setup(body, fallback) {
    const game = body.game ?? fallback.game;
    const cap = body.cap ?? fallback.cap;
    if (!R.validSetup(game, cap)) reject(400, "bad game");
    return { game, cap };
  }

  /** A new room with the caller in seat 0. */
  async function openRoom(partyName, host, { game, cap }) {
    const token = crypto.randomUUID();
    const t = now();
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode();
      const key = roomKey(code);
      const [claimed] = await store.pipeline([["HSETNX", key, "seed", randomSeed()], ["EXPIRE", key, TTL_S, "NX"]]);
      if (!claimed) continue;
      const { room } = await write(code, [[
        "HSET", key,
        "name", clean(partyName, MAX_PARTY_NAME) || R.PARTY_NAMES[0],
        "scale", scale,
        "g", game,
        "cap", cap,
        "seats", 1,
        "h", 0,
        "p:0", JSON.stringify({ name: host.name, emoji: host.emoji, joinedAt: t }),
        "t:0", await sha256(token),
        "s:0", t,
      ]]);
      return { code, seat: 0, token, room };
    }
    return reject(503, "no free room code");
  }

  const actions = {
    async create(body) {
      // A game with no time limit given gets that game's default one.
      const game = body.game ?? R.DEFAULT_GAME;
      return openRoom(body.party, player(body), setup(body, { game, cap: R.GAMES[game]?.cap }));
    },

    async join(body, { code }) {
      const who = player(body);
      const key = roomKey(code);
      const [n] = await store.pipeline([["HINCRBY", key, "seats", 1]]);
      const seat = n - 1;
      if (seat >= R.MAX_PLAYERS) reject(409, "room full");
      const token = crypto.randomUUID();
      const t = now();
      const out = await write(code, [[
        "HSET", key,
        `p:${seat}`, JSON.stringify({ name: who.name, emoji: who.emoji, joinedAt: t }),
        `t:${seat}`, await sha256(token),
        `s:${seat}`, t,
      ]]);
      return { code, seat, token, room: out.room };
    },

    async ping(body, { code, room, pings, seat }) {
      const t = now();
      const key = roomKey(code);
      const commands = [["HSET", key, `s:${seat}`, t]];
      if (seat !== room.host && t - (pings[room.host] || 0) > R.AWAY_MS * room.scale) {
        pings[seat] = t;
        if (nextHost(room, pings, t) === seat) commands.push(["HSET", key, "h", seat]);
      }
      return { room: (await write(code, commands)).room };
    },

    async start(body, { code, room }) {
      if (room.start != null) return { room };
      const here = room.players.filter((p) => p.kickedAt == null).length;
      if (here < R.MIN_PLAYERS) reject(409, `needs ${R.MIN_PLAYERS} players`);
      return { room: (await write(code, [["HSETNX", roomKey(code), "start", now()]])).room };
    },

    async result(body, { code, room, seat }) {
      const t = now();
      const d = R.derive(room, t);
      if (d.phase !== "play") reject(409, "round not live");
      // Removed seats were already refused in post(); this is "joined too late".
      if (!R.eligible(room, d.playAt).some((p) => p.seat === seat)) reject(403, "not in this round");
      if (body.seed !== room.seed) reject(400, "wrong board");
      const maxMs = Math.min(room.cap * 1000 * room.scale, t - d.playAt + R.GRACE_MS * room.scale);
      const { ms, moves } = body;
      if (!Number.isInteger(ms) || ms < R.MIN_SOLVE_MS * room.scale || ms > maxMs) reject(400, "implausible time");
      if (!Number.isInteger(moves) || moves < 1 || moves > R.MAX_MOVES) reject(400, "implausible moves");
      const result = JSON.stringify({ ms, moves, at: t });
      return { room: (await write(code, [["HSETNX", roomKey(code), `r:${seat}`, result]])).room };
    },

    /* The host calls time once at least half the room is done, so one player
       who wandered off does not hold everyone to the full limit. Anyone still
       playing did not finish. */
    async end(body, { code, room }) {
      if (R.derive(room, now()).phase !== "play") reject(409, "round not live");
      const { done, of } = R.progress(room);
      if (done * 2 < of) reject(409, "not enough done");
      return { room: (await write(code, [["HSETNX", roomKey(code), "ended", now()]])).room };
    },

    async kick(body, { code, room }) {
      const target = room.players.find((p) => p.seat === body.target);
      if (!target || target.seat === room.host) reject(400, "bad target");
      return { room: (await write(code, [["HSETNX", roomKey(code), `x:${target.seat}`, now()]])).room };
    },

    /* The next round is a new room: same name, the same or a new game, and
       everyone in this one follows the host into it. */
    async rematch(body, { code, room, seat }) {
      if (R.derive(room, now()).phase !== "final") reject(409, "clash not over");
      if (room.next) return { room };
      const choice = setup(body, room);
      const host = room.players.find((p) => p.seat === seat);
      const fresh = await openRoom(room.name, host, choice);
      const out = await write(code, [["HSETNX", roomKey(code), "next", fresh.code]]);
      // A double tap raced us: follow the room that won instead.
      if (out.room.next !== fresh.code) return { room: out.room };
      return fresh;
    },
  };

  async function post(request) {
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin) reject(403, "bad origin");
    const text = await request.text();
    if (text.length > MAX_BODY) reject(413, "too large");
    let body;
    try { body = JSON.parse(text); } catch { reject(400, "bad json"); }
    if (!body || typeof body !== "object" || !TYPES.includes(body.type)) reject(400, "bad type");

    await rateLimit(request, body.type);
    if (body.type === "create") return actions.create(body);

    const code = body.code;
    if (!CODE.test(code || "")) reject(400, "bad code");
    const found = await read(code);
    if (!found) reject(404, "no such room");
    const ctx = { code, room: found.room, pings: found.pings };

    if (body.type !== "join") {
      const seat = body.seat;
      const hash = Number.isInteger(seat) && typeof body.token === "string" && found.tokens[seat];
      if (!hash || hash !== (await sha256(body.token))) reject(403, "bad seat");
      if (found.room.players.find((p) => p.seat === seat).kickedAt != null) reject(403, "removed");
      if (HOST_ONLY.includes(body.type) && seat !== found.room.host) reject(403, "host only");
      ctx.seat = seat;
    }
    return actions[body.type](body, ctx);
  }

  return async function handle(request) {
    try {
      if (request.method === "GET") {
        const code = new URL(request.url).searchParams.get("r") || "";
        if (!CODE.test(code)) return json({ error: "bad code" }, 400, "no-store");
        const found = await read(code);
        // 404s are cached too: a phone polling a dead room costs the store
        // one read a second, not one per phone.
        if (!found) return json({ error: "no such room" }, 404, "public, s-maxage=1");
        return json({ room: found.room, serverNow: now() }, 200, "public, s-maxage=1");
      }
      if (request.method === "POST") {
        const out = await post(request);
        return json(Object.assign({ serverNow: now() }, out), 200, "no-store");
      }
      return json({ error: "method" }, 405, "no-store");
    } catch (e) {
      if (e instanceof Reject) return json({ error: e.message }, e.status, "no-store");
      return json({ error: "store unavailable" }, 503, "no-store");
    }
  };
}
