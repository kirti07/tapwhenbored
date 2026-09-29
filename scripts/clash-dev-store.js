// An in-memory stand-in for Upstash, for `npm run dev`, `npm run preview` and
// the Playwright suite — so none of them needs a network or a database.
//
// It implements `pipeline(commands)` for exactly the commands
// api/_lib/clash.js sends, with Redis's semantics for each, and nothing else:
// an unknown command throws, so a new one in the handler cannot silently
// behave differently here than in production.

export function createMemoryStore(now = Date.now) {
  const data = new Map(); // key -> Map (hash) | number (counter)
  const expires = new Map(); // key -> ms

  function live(key) {
    const at = expires.get(key);
    if (at !== undefined && at <= now()) {
      data.delete(key);
      expires.delete(key);
    }
    return data.get(key);
  }

  function hash(key) {
    let h = live(key);
    if (!(h instanceof Map)) {
      h = new Map();
      data.set(key, h);
    }
    return h;
  }

  const commands = {
    PING: () => "PONG",
    HGETALL(key) {
      const h = live(key);
      return h instanceof Map ? [...h].flat() : [];
    },
    HSET(key, ...pairs) {
      const h = hash(key);
      let added = 0;
      for (let i = 0; i < pairs.length; i += 2) {
        if (!h.has(pairs[i])) added++;
        h.set(pairs[i], String(pairs[i + 1]));
      }
      return added;
    },
    HSETNX(key, field, value) {
      const h = hash(key);
      if (h.has(field)) return 0;
      h.set(field, String(value));
      return 1;
    },
    HINCRBY(key, field, by) {
      const h = hash(key);
      const n = Number(h.get(field) || 0) + Number(by);
      h.set(field, String(n));
      return n;
    },
    INCR(key) {
      const n = (typeof live(key) === "number" ? data.get(key) : 0) + 1;
      data.set(key, n);
      return n;
    },
    EXPIRE(key, seconds, flag) {
      if (live(key) === undefined) return 0;
      if (flag === "NX" && expires.has(key)) return 0;
      expires.set(key, now() + Number(seconds) * 1000);
      return 1;
    },
  };

  return {
    async pipeline(list) {
      return list.map(([name, ...args]) => {
        const run = commands[name];
        if (!run) throw new Error(`clash-dev-store: ${name} is not implemented`);
        return run(...args);
      });
    },
  };
}
